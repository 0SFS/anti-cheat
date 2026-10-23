# Anti-cheat implementation

Status: **library landed, relay not built**
Date: 2026-10-22

## What this repository owns

Whether a pose, a burst or a launch is inside the envelope, and what a session does with that answer.

The server watcher is the authority. It runs on every message before a relay. The client watcher is the same checks, off unless the pilot turns `osfs.multiplayer.clientAntiCheat` on. It returns reports. It does not drop a pilot, does not edit a pose, and while it is off it does not store the message or call the checker. The flight loop should skip it entirely in that case. The watcher also returns immediately, so a mistaken call stays a branch.

This package imports `@0sfs/multiplayer` for the message types and the local distance. It does not import a transport.

## Bounds

`MOTION_BOUNDS`, `GUN_BOUNDS` and `MISSILE_BOUNDS` are the default envelope. They are wide enough that an honest fast jet stays inside, and tight enough that a teleport or a magic muzzle fails. An aircraft card can pass a tighter `limitsFor(aircraftId)` later. The numbers are cheat limits, not performance data.

| Bound | Default |
| --- | --- |
| Horizontal speed | 900 m/s, with 5% slack and 5 m |
| Vertical speed | 250 m/s, with 5% slack and 2 m |
| Heading change | 2 rad/s, and the step check allows twice that |
| Body rate | 8 rad/s |
| Muzzle speed | 1200 m/s |
| Burst | 40 rounds, 100 per second |
| Muzzle or launch, from the aircraft | 80 m, plus the aircraft's speed over the gap, and the gap itself must be within 1 s |
| Missile speed | 1500 m/s |
| Missile turn | 2 rad/s, and a step may exceed it by a quarter |
| Navigation gain | 6 |

Load factor is not checked. It joins the pose, and this envelope, when a message carries it.

## Checks

`reviewPoseClaim` reads one pose: advertised ground speed and body rate. The first pose of a session is not free.

`reviewPoseStep` reads two poses of the same pilot and aircraft. Time must advance. The distance and the altitude change must fit the bounds. The heading change and the claim on the newer pose must too.

`reviewBurst` and `reviewLaunch` require a shooter pose within a second, a muzzle inside the radius, and a weapon inside the gun or missile card.

`reviewMissileStep` reads two missile states. It is here for a later snapshot of a missile the server re-integrated. The event path judges the launch, because peers do not accept a missile position from the shooter.

## Server watcher

`createServerWatch()`. `pose`, `burst` and `launch` return `{ accepted, dropped, report }`.

The first pose that passes `reviewPoseClaim` is the baseline. A later pose is compared with `reviewPoseStep`. An older sequence is ignored and is not a strike. A failure does not replace the baseline, so peers keep the last accepted pose. Three failures drop the pilot. Further messages report `dropped`.

A burst or launch with no accepted pose is `missing-shooter` and counts as a failure.

The WebTransport process, when it exists, calls this watcher and relays only an accepted message.

## Client watcher

`createClientWatch()`, created disabled.

`setEnabled(true)` starts storage. `notePose`, `noteBurst` and `noteLaunch` keep the latest pose per pilot and up to 32 weapon events. `poll(nowMs)` runs at most once per `sampleIntervalMs` (100 ms) and returns `ClientReport`s. A weapon event with no pose yet waits for one.

`setEnabled(false)` drops everything it stored. Turning it back on does not review the messages it missed.

Reports are for the pilot who opted in. The drawn world stays the session world.
