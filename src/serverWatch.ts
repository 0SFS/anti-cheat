/**
 * Authority watcher. Run this on every message before it is relayed.
 *
 * Three failures in a session drop the pilot. Later messages from that pilot
 * are refused. The check itself is `review.ts`; this watcher only counts.
 */

import type { AircraftPose, FireBurst, MissileLaunch } from "@0sfs/multiplayer/protocol";
import { GUN_BOUNDS, MISSILE_BOUNDS, MOTION_BOUNDS, type GunLimits, type MissileLimits, type MotionLimits } from "./bounds";
import { reviewBurst, reviewLaunch, reviewPoseClaim, reviewPoseStep, type Verdict } from "./review";

export interface CheatReport {
  pilotId: string;
  tMs: number;
  code: string;
  detail: string;
  source: "server";
}

export interface ServerDecision {
  accepted: boolean;
  dropped: boolean;
  report: CheatReport | null;
}

export function createServerWatch(options: {
  limitsFor?: (aircraftId: string) => MotionLimits;
  gun?: GunLimits;
  missile?: MissileLimits;
  strikesBeforeDrop?: number;
} = {}) {
  const limitsFor = options.limitsFor ?? (() => MOTION_BOUNDS);
  const gun = options.gun ?? GUN_BOUNDS;
  const missile = options.missile ?? MISSILE_BOUNDS;
  const strikesBeforeDrop = options.strikesBeforeDrop ?? 3;
  const accepted = new Map<string, AircraftPose>();
  const strikes = new Map<string, CheatReport[]>();
  const dropped = new Set<string>();

  function pose(next: AircraftPose): ServerDecision {
    if (dropped.has(next.pilotId)) return refused(next.pilotId, next.tMs);
    const previous = accepted.get(next.pilotId);
    if (!previous) {
      return judge(next.pilotId, next.tMs, reviewPoseClaim(next, limitsFor(next.aircraftId)), () => {
        accepted.set(next.pilotId, next);
      });
    }
    if (next.seq <= previous.seq) return { accepted: false, dropped: false, report: null };
    return judge(next.pilotId, next.tMs, reviewPoseStep(previous, next, limitsFor(next.aircraftId)), () => {
      accepted.set(next.pilotId, next);
    });
  }

  function burst(burstMessage: FireBurst): ServerDecision {
    if (dropped.has(burstMessage.shooterId)) return refused(burstMessage.shooterId, burstMessage.tMs);
    const shooter = accepted.get(burstMessage.shooterId);
    if (!shooter) return judge(burstMessage.shooterId, burstMessage.tMs, {
      ok: false, code: "missing-shooter", detail: "Burst with no accepted pose.",
    });
    return judge(burstMessage.shooterId, burstMessage.tMs, reviewBurst(burstMessage, shooter, gun));
  }

  function launch(launchMessage: MissileLaunch): ServerDecision {
    if (dropped.has(launchMessage.shooterId)) return refused(launchMessage.shooterId, launchMessage.tMs);
    const shooter = accepted.get(launchMessage.shooterId);
    if (!shooter) return judge(launchMessage.shooterId, launchMessage.tMs, {
      ok: false, code: "missing-shooter", detail: "Launch with no accepted pose.",
    });
    return judge(launchMessage.shooterId, launchMessage.tMs, reviewLaunch(launchMessage, shooter, missile));
  }

  function judge(pilotId: string, tMs: number, verdict: Verdict, onAccept?: () => void): ServerDecision {
    if (verdict.ok) {
      onAccept?.();
      return { accepted: true, dropped: false, report: null };
    }
    const report: CheatReport = { pilotId, tMs, code: verdict.code, detail: verdict.detail, source: "server" };
    const list = strikes.get(pilotId) ?? [];
    list.push(report);
    strikes.set(pilotId, list);
    const gone = list.length >= strikesBeforeDrop;
    if (gone) dropped.add(pilotId);
    return { accepted: false, dropped: gone, report };
  }

  function refused(pilotId: string, tMs: number): ServerDecision {
    return {
      accepted: false,
      dropped: true,
      report: { pilotId, tMs, code: "dropped", detail: "Pilot already removed.", source: "server" },
    };
  }

  return {
    pose,
    burst,
    launch,
    strikes: (pilotId: string) => strikes.get(pilotId)?.length ?? 0,
    isDropped: (pilotId: string) => dropped.has(pilotId),
    acceptedPose: (pilotId: string) => accepted.get(pilotId) ?? null,
  };
}

export type ServerWatch = ReturnType<typeof createServerWatch>;
