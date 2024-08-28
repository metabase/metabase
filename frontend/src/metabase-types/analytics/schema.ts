import type { AccountEvent } from "./account";
import type { ActionEvent } from "./action";
import type { BrowseDataEvent } from "./browse_data";
import type { CleanupEvent } from "./cleanup";
import type { SimpleEvent } from "./event";
import type { TimelineEvent } from "./timeline";
import type { UpsellEvent } from "./upsell";

export type SchemaEventMap = {
  account: AccountEvent;
  action: ActionEvent;
  browse_data: BrowseDataEvent;
  cleanup: CleanupEvent;
  event: SimpleEvent;
  timeline: TimelineEvent;
  upsell: UpsellEvent;
};

export type SchemaType = keyof SchemaEventMap;

export type SchemaEvent = SchemaEventMap[SchemaType];
