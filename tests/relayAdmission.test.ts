import { describe, expect, it } from "vitest";
import { encodeMessage, parseMessage, type SessionMessage } from "@0sfs/multiplayer/protocol";
import { createServerRelay, type RelaySocket } from "@0sfs/multiplayer/serverRelay";
import { createRelayAdmission } from "../src/relayAdmission";

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const settings = { damageImplementation: "health-v1" as const, settingsEditors: "host" as const };
function pose(over: Record<string, unknown> = {}) {
  return { pilotId: "host", seq: 1, tMs: 1_000, aircraftId: "f-35b", latDeg: 45, lonDeg: -93, altMeters: 3_000,
    rollRad: 0, pitchRad: 0, headingRad: 0, airspeedKts: 300, northVelocityFps: 200, eastVelocityFps: 0, verticalSpeedFps: 0,
    rollRateRadPerSec: 0, pitchRateRadPerSec: 0, yawRateRadPerSec: 0, throttleNorm: 0.5, gearDown: false, flapsNorm: 0, afterburner: false,
    damageImplementation: "health-v1", sharedSettingsRevision: 0, ...over };
}
function couple() {
  let closed = false;
  const sides = [0, 1].map(() => ({ reliable: null as ((value: string) => void) | null, datagram: null as ((value: string) => void) | null, close: null as ((reason: string) => void) | null }));
  function make(index: number): RelaySocket {
    return {
      sendReliable(encoded) { if (closed) return false; queueMicrotask(() => sides[1 - index].reliable?.(encoded)); return true; },
      sendDatagram(encoded) { if (closed) return false; queueMicrotask(() => sides[1 - index].datagram?.(encoded)); return true; },
      close(reason = "closed") { if (closed) return; closed = true; queueMicrotask(() => { for (const side of sides) side.close?.(reason); }); },
      onReliable(handler) { sides[index].reliable = handler; },
      onDatagram(handler) { sides[index].datagram = handler; },
      onClose(handler) { sides[index].close = handler; },
    };
  }
  return { client: make(0), server: make(1) };
}

describe("relay admission", () => {
  it("relays an honest pose and drops a teleport before the other pilot sees it", async () => {
    const relay = createServerRelay({ admission: createRelayAdmission, now: () => 1_000 });
    const hostLink = couple();
    const guestLink = couple();
    const host: SessionMessage[] = [];
    const guest: SessionMessage[] = [];
    let hostClosed = "";
    hostLink.client.onReliable(encoded => { const message = parseMessage(encoded); if (message) host.push(message); });
    hostLink.client.onDatagram(encoded => { const message = parseMessage(encoded); if (message) host.push(message); });
    hostLink.client.onClose(reason => { hostClosed = reason; });
    guestLink.client.onDatagram(encoded => { const message = parseMessage(encoded); if (message) guest.push(message); });
    relay.accept(hostLink.server);
    relay.accept(guestLink.server);
    const send = (link: ReturnType<typeof couple>, message: SessionMessage) => link.client.sendReliable(encodeMessage(message)!);
    send(hostLink, { type: "open-flight", v: 2, pilotId: "host", aircraftId: "f-35b", damageImplementations: ["health-v1"], settings });
    await flush();
    const welcome = host.find(message => message.type === "welcome");
    if (welcome?.type !== "welcome" || !welcome.secret) throw new Error("missing invitation");
    send(guestLink, { type: "hello", v: 2, pilotId: "guest", secret: welcome.secret, aircraftId: "cessna-172", damageImplementations: ["health-v1"], sessionId: welcome.sessionId });
    await flush();
    send(guestLink, { type: "shared-settings-ack", revision: 0 });
    await flush();
    hostLink.client.sendDatagram(encodeMessage({ type: "pose", pose: pose() })!);
    await flush();
    expect(guest).toEqual([{ type: "pose", pose: pose() }]);
    hostLink.client.sendDatagram(encodeMessage({ type: "pose", pose: pose({ seq: 2, tMs: 1_100, latDeg: 80 }) })!);
    await flush();
    expect(guest).toEqual([{ type: "pose", pose: pose() }]);
    expect(host.some(message => message.type === "reject" && message.code === "speed")).toBe(true);
    for (const seq of [1, 2, 3]) send(hostLink, { type: "fire", burst: {
      shooterId: "host", seq, tMs: 1_000, count: 1, rateHz: 10, latDeg: 50, lonDeg: -93, altMeters: 3_000,
      northMps: 800, eastMps: 0, upMps: 0, dragPerSec: 0, lifeS: 2,
    } });
    await flush();
    expect(hostClosed).toBe("strikes");
    expect(guest).toEqual([{ type: "pose", pose: pose() }]);
    relay.close();
  });
});
