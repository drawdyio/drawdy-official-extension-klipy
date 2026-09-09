import { DriverCommandIssuer } from "@drawdy/driver-protocol";
import { CUSTOMER_STORAGE_KEY } from "./consts";

export type StorageCtx = {
  driverId: string;
  issueCommand: DriverCommandIssuer;
  nextRequestId: () => string;
};

export function randomUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export async function loadCustomerId(ctx: StorageCtx): Promise<string> {
  const res = await ctx.issueCommand({
    type: "command:kv-storage:get",
    driverId: ctx.driverId,
    requestId: ctx.nextRequestId(),
    req: { key: CUSTOMER_STORAGE_KEY },
  });
  const existing = res.res.value?.got?.["customerId"];
  if (typeof existing === "string" && existing.length > 0) return existing;
  const customerId = randomUuid();
  await ctx.issueCommand({
    type: "command:kv-storage:set",
    driverId: ctx.driverId,
    requestId: ctx.nextRequestId(),
    req: { key: CUSTOMER_STORAGE_KEY, payload: { customerId } },
  });
  return customerId;
}
