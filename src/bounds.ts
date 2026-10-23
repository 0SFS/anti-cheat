/**
 * Cheat bounds.
 *
 * These are wide on purpose: they catch a teleport and a magic round, and
 * they leave an honest F-35B inside the envelope. An aircraft card can pass
 * a tighter set. They are not a flight model.
 */

export interface MotionLimits {
  maxSpeedMps: number;
  maxVerticalMps: number;
  /** How fast the heading may change, rad/s. */
  maxHeadingRateRadPerSec: number;
  /** Body-rate magnitude the pose may advertise, rad/s. A snap roll lives here. */
  maxBodyRateRadPerSec: number;
}

export interface GunLimits {
  maxMuzzleMps: number;
  maxBurst: number;
  maxRateHz: number;
  /** Muzzle must sit within this radius of the shooter, plus one second of travel. */
  muzzleRadiusM: number;
}

export interface MissileLimits {
  maxSpeedMps: number;
  maxTurnRadPerSec: number;
  maxNavGain: number;
  /** Launch point must sit within this radius of the shooter. */
  launchRadiusM: number;
}

export const MOTION_BOUNDS: MotionLimits = {
  maxSpeedMps: 900,
  maxVerticalMps: 250,
  maxHeadingRateRadPerSec: 2,
  maxBodyRateRadPerSec: 8,
};

export const GUN_BOUNDS: GunLimits = {
  maxMuzzleMps: 1200,
  maxBurst: 40,
  maxRateHz: 100,
  muzzleRadiusM: 80,
};

export const MISSILE_BOUNDS: MissileLimits = {
  maxSpeedMps: 1500,
  maxTurnRadPerSec: 2,
  maxNavGain: 6,
  launchRadiusM: 80,
};

/** Off unless a pilot turns it on. The flight loop skips the watcher while it is off. */
export const CLIENT_ANTICHEAT_PARAMETER_ID = "osfs.multiplayer.clientAntiCheat";
