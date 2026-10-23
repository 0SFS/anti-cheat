/**
 * Envelope checks shared by the server and the opt-in client watcher.
 *
 * A passing check is a message the session may keep. A failing check names
 * what broke. The watcher decides whether that drops the message.
 */

import { distanceM } from "@0sfs/multiplayer/geodetic";
import {
  groundSpeedMps, muzzleSpeedMps, type AircraftPose, type FireBurst, type MissileLaunch, type MissileState,
} from "@0sfs/multiplayer/protocol";
import type { GunLimits, MissileLimits, MotionLimits } from "./bounds";

export interface Verdict {
  ok: boolean;
  code: string;
  detail: string;
}

const pass: Verdict = { ok: true, code: "ok", detail: "" };

export function reviewPoseClaim(pose: AircraftPose, limits: MotionLimits): Verdict {
  if (groundSpeedMps(pose) > limits.maxSpeedMps * 1.05) {
    return fail("claimed-speed", `Claimed ${groundSpeedMps(pose).toFixed(0)} m/s.`);
  }
  const body = Math.hypot(pose.rollRateRadPerSec, pose.pitchRateRadPerSec, pose.yawRateRadPerSec);
  if (body > limits.maxBodyRateRadPerSec) return fail("rate", `Body rate ${body.toFixed(2)} rad/s.`);
  return pass;
}

export function reviewPoseStep(previous: AircraftPose, next: AircraftPose, limits: MotionLimits): Verdict {
  if (next.pilotId !== previous.pilotId) return fail("pilot", "Pose pilot changed.");
  if (next.aircraftId !== previous.aircraftId) return fail("aircraft", "Aircraft changed inside the session.");
  const dt = (next.tMs - previous.tMs) / 1000;
  if (!(dt > 0)) return fail("time", "Pose time did not advance.");
  const moved = distanceM(previous, next);
  if (moved > limits.maxSpeedMps * dt * 1.05 + 5) {
    return fail("speed", `Moved ${moved.toFixed(0)} m in ${dt.toFixed(3)} s.`);
  }
  const climbed = Math.abs(next.altMeters - previous.altMeters);
  if (climbed > limits.maxVerticalMps * dt * 1.05 + 2) {
    return fail("vertical", `Altitude changed ${climbed.toFixed(0)} m in ${dt.toFixed(3)} s.`);
  }
  const claimed = reviewPoseClaim(next, limits);
  if (!claimed.ok) return claimed;
  const heading = angleBetween(previous.headingRad, next.headingRad);
  if (heading / dt > limits.maxHeadingRateRadPerSec * 2) {
    return fail("turn", `Heading changed ${(heading / dt).toFixed(2)} rad/s.`);
  }
  return pass;
}

export function reviewBurst(burst: FireBurst, shooter: AircraftPose, gun: GunLimits): Verdict {
  if (burst.shooterId !== shooter.pilotId) return fail("pilot", "Burst shooter does not match the pose.");
  if (Math.abs(burst.tMs - shooter.tMs) > 1000) return fail("shot-time", "Burst is more than a second from the shooter pose.");
  if (burst.count > gun.maxBurst) return fail("burst", `${burst.count} rounds in one burst.`);
  if (burst.rateHz > gun.maxRateHz) return fail("rate", `${burst.rateHz} rounds per second.`);
  const muzzle = muzzleSpeedMps(burst);
  if (muzzle > gun.maxMuzzleMps) return fail("muzzle", `Muzzle ${muzzle.toFixed(0)} m/s.`);
  const slack = gun.muzzleRadiusM + groundSpeedMps(shooter) * Math.abs(burst.tMs - shooter.tMs) / 1000;
  const away = distanceM(shooter, burst);
  if (away > slack) return fail("origin", `Muzzle ${away.toFixed(0)} m from the aircraft.`);
  return pass;
}

export function reviewLaunch(launch: MissileLaunch, shooter: AircraftPose, limits: MissileLimits): Verdict {
  if (launch.shooterId !== shooter.pilotId) return fail("pilot", "Launch shooter does not match the pose.");
  if (Math.abs(launch.tMs - shooter.tMs) > 1000) return fail("shot-time", "Launch is more than a second from the shooter pose.");
  const speed = Math.hypot(launch.northMps, launch.eastMps, launch.upMps);
  if (speed > limits.maxSpeedMps || launch.speedMps > limits.maxSpeedMps) {
    return fail("speed", `Launch speed ${Math.max(speed, launch.speedMps).toFixed(0)} m/s.`);
  }
  if (launch.maxTurnRadPerSec > limits.maxTurnRadPerSec) return fail("turn", `Turn cap ${launch.maxTurnRadPerSec} rad/s.`);
  if (launch.navGain > limits.maxNavGain) return fail("gain", `Navigation gain ${launch.navGain}.`);
  const slack = limits.launchRadiusM + groundSpeedMps(shooter) * Math.abs(launch.tMs - shooter.tMs) / 1000;
  const away = distanceM(shooter, launch);
  if (away > slack) return fail("origin", `Launch ${away.toFixed(0)} m from the aircraft.`);
  return pass;
}

export function reviewMissileStep(previous: MissileState, next: MissileState, limits: MissileLimits): Verdict {
  const dt = (next.tMs - previous.tMs) / 1000;
  if (!(dt > 0)) return fail("time", "Missile time did not advance.");
  const speed = Math.hypot(next.northMps, next.eastMps, next.upMps);
  if (speed > limits.maxSpeedMps * 1.05) return fail("speed", `Missile at ${speed.toFixed(0)} m/s.`);
  const turned = velocityAngle(previous, next);
  if (turned / dt > limits.maxTurnRadPerSec * 1.25) {
    return fail("turn", `Missile turned ${(turned / dt).toFixed(2)} rad/s.`);
  }
  return pass;
}

function velocityAngle(a: MissileState, b: MissileState): number {
  const am = Math.hypot(a.northMps, a.eastMps, a.upMps);
  const bm = Math.hypot(b.northMps, b.eastMps, b.upMps);
  if (am < 1e-6 || bm < 1e-6) return 0;
  const dot = (a.northMps * b.northMps + a.eastMps * b.eastMps + a.upMps * b.upMps) / (am * bm);
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

function angleBetween(a: number, b: number): number {
  const delta = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return Math.abs(delta);
}

function fail(code: string, detail: string): Verdict {
  return { ok: false, code, detail };
}
