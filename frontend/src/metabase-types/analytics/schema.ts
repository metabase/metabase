import type { AccountEvent } from "./account";
import type { ActionEvent } from "./action";
import type { BrowseDataEvent } from "./browse_data";
import type { CleanupEvent } from "./cleanup";
import type { SimpleEvent } from "./event";
import type { QuestionEvent } from "./question";
import type { SearchEvent } from "./search";
import type { SerializationEvent } from "./serialization";
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
  question: QuestionEvent;
  search: SearchEvent;
  serialization: SerializationEvent;
  settings: SettingsEvent;
  setup: SetupEvent;
  timeline: TimelineEvent;
  upsell: UpsellEvent;
};

export type SchemaType = keyof SchemaEventMap;

export type SchemaEvent = SchemaEventMap[SchemaType];
