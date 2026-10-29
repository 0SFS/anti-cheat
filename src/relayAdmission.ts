/**
 * One admission checker per flight. The relay calls it before fan-out.
 * A dropped pilot is not relayed again; peers keep the last accepted pose.
 */

import type { RelayAdmission, RelayVerdict } from "@0sfs/multiplayer/serverRelay";
import { createServerWatch, type ServerDecision } from "./serverWatch";

function verdict(decision: ServerDecision): RelayVerdict {
  return { accepted: decision.accepted, dropped: decision.dropped, code: decision.report?.code ?? null };
}

export function createRelayAdmission(): RelayAdmission {
  const watch = createServerWatch();
  return {
    pose: pose => verdict(watch.pose(pose)),
    burst: burst => verdict(watch.burst(burst)),
    launch: launch => verdict(watch.launch(launch)),
  };
}
