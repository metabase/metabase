import type { AccountEvent } from "./account";
import type { ActionEvent } from "./action";
import type { BrowseDataEvent } from "./browse_data";
import type { CleanupEvent } from "./cleanup";
import type { SimpleEvent } from "./event";
import type { SettingsEvent } from "./settings";
import type { SetupEvent } from "./setup";
import type { TimelineEvent } from "./timeline";
import type { UpsellEvent } from "./upsell";

export type SchemaEventMap = {
  account: AccountEvent;
  action: ActionEvent;
  browse_data: BrowseDataEvent;
  cleanup: CleanupEvent;
  event: SimpleEvent;
  settings: SettingsEvent;
  setup: SetupEvent;
  timeline: TimelineEvent;
  upsell: UpsellEvent;
};

export type SchemaType = keyof SchemaEventMap;

export type SchemaEvent = SchemaEventMap[SchemaType];
