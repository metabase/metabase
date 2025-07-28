import type { Card } from "./card";
import type { Channel } from "./notification-channels";

export type Pulse = {
  cards: Card[];
  channels: Channel[];
  name?: string;
  parameters?: any[];
  skip_if_empty?: boolean;
  attachments_only?: boolean;
};

export type PulseParameter = {
  default: boolean;
  id: number;
  name?: string;
  slug?: string;
  type?: string;
  value?: string;
};
