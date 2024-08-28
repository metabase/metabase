import type { AccountEvent } from "./account";
import type { ActionEvent } from "./action";
import type { BrowseDataEvent } from "./browse_data";
import type { CleanupEvent } from "./cleanup";
import type { EmbeddingHomepageEvent } from "./embedding-homepage";
import type { SimpleEvent } from "./event";
import type { InviteEvent } from "./invite";
import type { LlmUsageEvent } from "./llm-usage";
import type { MetabotEvent } from "./metabot";
import type { ModelEvent } from "./model";
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
  embedding_homepage: EmbeddingHomepageEvent;
  event: SimpleEvent;
  invite: InviteEvent;
  llm_usage: LlmUsageEvent;
  metabot: MetabotEvent;
  model: ModelEvent;
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
