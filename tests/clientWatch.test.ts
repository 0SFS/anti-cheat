import { describe, expect, it } from "vitest";
import type { AircraftPose } from "@0sfs/multiplayer/protocol";
import { MOTION_BOUNDS } from "../src/bounds";
import { createClientWatch } from "../src/clientWatch";

function pose(over: Partial<AircraftPose> = {}): AircraftPose {
  return {
    pilotId: "b", seq: 1, tMs: 1_000, aircraftId: "f-35b",
    latDeg: 45, lonDeg: -93, altMeters: 3_000,
    rollRad: 0, pitchRad: 0, headingRad: 0, airspeedKts: 300,
    northVelocityFps: 200, eastVelocityFps: 0, verticalSpeedFps: 0,
    rollRateRadPerSec: 0, pitchRateRadPerSec: 0, yawRateRadPerSec: 0,
    throttleNorm: 0.5, gearDown: false, flapsNorm: 0, afterburner: false,
    ...over,
  };
}

describe("client watch", () => {
  it("does no checking until a pilot turns it on, and then reports the teleport", () => {
    let checks = 0;
    const watch = createClientWatch({
      limitsFor: () => { checks += 1; return MOTION_BOUNDS; },
      sampleIntervalMs: 100,
    });
    watch.notePose(pose());
    watch.notePose(pose({ seq: 2, tMs: 1_100, latDeg: 70 }));
    expect(watch.poll(1_000)).toEqual([]);
    expect(checks).toBe(0);

    watch.setEnabled(true);
    watch.notePose(pose());
    watch.notePose(pose({ seq: 2, tMs: 1_100, latDeg: 70 }));
    expect(watch.poll(1_000).map(report => report.code)).toEqual(["speed"]);
    expect(checks).toBeGreaterThan(0);

    watch.notePose(pose({ seq: 3, tMs: 1_200, latDeg: 71 }));
    expect(watch.poll(1_050)).toEqual([]);
  });

  it("forgets what it saw when the pilot turns it off", () => {
    const watch = createClientWatch();
    watch.setEnabled(true);
    watch.notePose(pose());
    watch.notePose(pose({ seq: 2, tMs: 1_100, latDeg: 70 }));
    watch.setEnabled(false);
    watch.setEnabled(true);
    expect(watch.poll(5_000)).toEqual([]);
  });
});
