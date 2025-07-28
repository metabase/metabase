import type { Pulse } from "metabase-types/api";

export const createMockPulse = (opts?: Partial<Pulse>): Pulse => ({
  name: "Pulse",
  cards: [],
  channels: [],
  parameters: [],
  skip_if_empty: false,
  attachments_only: false,
  ...opts,
});
