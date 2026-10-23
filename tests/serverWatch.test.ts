import { describe, expect, it } from "vitest";
import type { AircraftPose, FireBurst } from "@0sfs/multiplayer/protocol";
import { createServerWatch } from "../src/serverWatch";

function pose(over: Partial<AircraftPose> = {}): AircraftPose {
  return {
    pilotId: "a", seq: 1, tMs: 1_000, aircraftId: "f-35b",
    latDeg: 45, lonDeg: -93, altMeters: 3_000,
    rollRad: 0, pitchRad: 0, headingRad: 0, airspeedKts: 300,
    northVelocityFps: 200, eastVelocityFps: 0, verticalSpeedFps: 0,
    rollRateRadPerSec: 0, pitchRateRadPerSec: 0, yawRateRadPerSec: 0,
    throttleNorm: 0.5, gearDown: false, flapsNorm: 0, afterburner: false,
    ...over,
  };
}

function farBurst(seq: number): FireBurst {
  return {
    shooterId: "a", seq, tMs: 1_000, count: 1, rateHz: 10,
    latDeg: 50, lonDeg: -93, altMeters: 3_000,
    northMps: 800, eastMps: 0, upMps: 0, dragPerSec: 0, lifeS: 2,
  };
}

describe("server watch", () => {
  it("keeps the last accepted pose and drops a pilot on the third failure", () => {
    const server = createServerWatch();
    expect(server.pose(pose()).accepted).toBe(true);
    expect(server.burst(farBurst(1)).report?.code).toBe("origin");
    expect(server.burst(farBurst(2)).dropped).toBe(false);
    expect(server.burst(farBurst(3)).dropped).toBe(true);
    expect(server.pose(pose({ seq: 2, tMs: 1_100 })).report?.code).toBe("dropped");
    expect(server.acceptedPose("a")?.latDeg).toBe(45);
  });

  it("refuses a first pose that already advertises an impossible speed", () => {
    const server = createServerWatch();
    const decision = server.pose(pose({ northVelocityFps: 20_000 }));
    expect(decision.accepted).toBe(false);
    expect(decision.report?.code).toBe("claimed-speed");
    expect(server.acceptedPose("a")).toBeNull();
  });
});
