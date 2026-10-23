import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_M } from "@0sfs/multiplayer/geodetic";
import type { AircraftPose } from "@0sfs/multiplayer/protocol";
import { GUN_BOUNDS, MISSILE_BOUNDS, MOTION_BOUNDS } from "../src/bounds";
import { reviewBurst, reviewLaunch, reviewMissileStep, reviewPoseStep } from "../src/review";
import { missileFromLaunch } from "@0sfs/multiplayer/guidance";

function pose(over: Partial<AircraftPose> = {}): AircraftPose {
  return {
    pilotId: "a", seq: 1, tMs: 1_000, aircraftId: "f-35b",
    latDeg: 45, lonDeg: -93, altMeters: 3_000,
    rollRad: 0, pitchRad: 0, headingRad: 0, airspeedKts: 300,
    northVelocityFps: 500, eastVelocityFps: 0, verticalSpeedFps: 0,
    rollRateRadPerSec: 0, pitchRateRadPerSec: 0, yawRateRadPerSec: 0,
    throttleNorm: 0.7, gearDown: false, flapsNorm: 0, afterburner: false,
    ...over,
  };
}

describe("envelope", () => {
  it("accepts a one-second cruise and rejects a teleport", () => {
    const northM = 150;
    const latDeg = 45 + (northM / EARTH_RADIUS_M) * (180 / Math.PI);
    expect(reviewPoseStep(pose(), pose({ seq: 2, tMs: 2_000, latDeg }), MOTION_BOUNDS).ok).toBe(true);
    expect(reviewPoseStep(pose(), pose({ seq: 2, tMs: 1_100, latDeg: 48 }), MOTION_BOUNDS).code).toBe("speed");
  });

  it("rejects a muzzle far from the aircraft and a missile that snaps through a right angle", () => {
    expect(reviewBurst({
      shooterId: "a", seq: 1, tMs: 1_000, count: 1, rateHz: 20,
      latDeg: 46, lonDeg: -93, altMeters: 3_000,
      northMps: 800, eastMps: 0, upMps: 0, dragPerSec: 0, lifeS: 2,
    }, pose(), GUN_BOUNDS).code).toBe("origin");
    const launch = {
      missileId: "m1", shooterId: "a", seq: 1, tMs: 1_000, latDeg: 45, lonDeg: -93, altMeters: 3_000,
      northMps: 300, eastMps: 0, upMps: 0, navGain: 3, maxTurnRadPerSec: 1, speedMps: 300, lifeS: 10,
    };
    expect(reviewLaunch(launch, pose(), MISSILE_BOUNDS).ok).toBe(true);
    const state = missileFromLaunch(launch);
    const snapped = { ...state, tMs: state.tMs + 100, northMps: 0, eastMps: 300 };
    expect(reviewMissileStep(state, snapped, MISSILE_BOUNDS).code).toBe("turn");
  });
});
