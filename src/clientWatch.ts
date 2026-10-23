/**
 * Opt-in report of other pilots' messages.
 *
 * Created off. While it is off, notes return without storing or checking, and
 * the flight loop should not call it at all. Turning it on reports failures.
 * It never removes a pilot and never edits a pose.
 */

import type { AircraftPose, FireBurst, MissileLaunch } from "@0sfs/multiplayer/protocol";
import { GUN_BOUNDS, MISSILE_BOUNDS, MOTION_BOUNDS, type GunLimits, type MissileLimits, type MotionLimits } from "./bounds";
import { reviewBurst, reviewLaunch, reviewPoseClaim, reviewPoseStep } from "./review";

export interface ClientReport {
  pilotId: string;
  tMs: number;
  code: string;
  detail: string;
  source: "client";
}

interface DeferredBurst { kind: "burst"; burst: FireBurst }
interface DeferredLaunch { kind: "launch"; launch: MissileLaunch }

export function createClientWatch(options: {
  limitsFor?: (aircraftId: string) => MotionLimits;
  gun?: GunLimits;
  missile?: MissileLimits;
  sampleIntervalMs?: number;
} = {}) {
  const limitsFor = options.limitsFor ?? (() => MOTION_BOUNDS);
  const gun = options.gun ?? GUN_BOUNDS;
  const missile = options.missile ?? MISSILE_BOUNDS;
  const sampleIntervalMs = options.sampleIntervalMs ?? 100;
  let enabled = false;
  let lastSampleMs = -Infinity;
  const latest = new Map<string, AircraftPose>();
  const previous = new Map<string, AircraftPose>();
  const dirty = new Set<string>();
  let waiting: Array<DeferredBurst | DeferredLaunch> = [];

  function notePose(pose: AircraftPose): void {
    if (!enabled) return;
    const prior = latest.get(pose.pilotId);
    if (prior && pose.seq <= prior.seq) return;
    if (prior) previous.set(pose.pilotId, prior);
    latest.set(pose.pilotId, pose);
    dirty.add(pose.pilotId);
  }

  function noteBurst(burst: FireBurst): void {
    if (!enabled) return;
    waiting.push({ kind: "burst", burst });
    if (waiting.length > 32) waiting = waiting.slice(-32);
  }

  function noteLaunch(launch: MissileLaunch): void {
    if (!enabled) return;
    waiting.push({ kind: "launch", launch });
    if (waiting.length > 32) waiting = waiting.slice(-32);
  }

  function poll(nowMs: number): ClientReport[] {
    if (!enabled || nowMs - lastSampleMs < sampleIntervalMs) return [];
    lastSampleMs = nowMs;
    const reports: ClientReport[] = [];
    for (const pilotId of dirty) {
      const next = latest.get(pilotId);
      const prior = previous.get(pilotId);
      if (!next) continue;
      const verdict = prior
        ? reviewPoseStep(prior, next, limitsFor(next.aircraftId))
        : reviewPoseClaim(next, limitsFor(next.aircraftId));
      if (!verdict.ok) reports.push({ pilotId, tMs: next.tMs, code: verdict.code, detail: verdict.detail, source: "client" });
    }
    dirty.clear();
    const still: Array<DeferredBurst | DeferredLaunch> = [];
    for (const item of waiting) {
      if (item.kind === "burst") {
        const shooter = latest.get(item.burst.shooterId);
        if (!shooter) { still.push(item); continue; }
        const verdict = reviewBurst(item.burst, shooter, gun);
        if (!verdict.ok) reports.push({
          pilotId: item.burst.shooterId, tMs: item.burst.tMs, code: verdict.code, detail: verdict.detail, source: "client",
        });
      } else {
        const shooter = latest.get(item.launch.shooterId);
        if (!shooter) { still.push(item); continue; }
        const verdict = reviewLaunch(item.launch, shooter, missile);
        if (!verdict.ok) reports.push({
          pilotId: item.launch.shooterId, tMs: item.launch.tMs, code: verdict.code, detail: verdict.detail, source: "client",
        });
      }
    }
    waiting = still.slice(-32);
    return reports;
  }

  return {
    setEnabled(value: boolean) {
      enabled = value;
      if (!value) {
        latest.clear();
        previous.clear();
        dirty.clear();
        waiting = [];
      }
    },
    get enabled() { return enabled; },
    notePose,
    noteBurst,
    noteLaunch,
    poll,
  };
}

export type ClientWatch = ReturnType<typeof createClientWatch>;
