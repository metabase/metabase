import type { AccountEvent } from "./account";
import type { ActionEvent } from "./action";
import type { BrowseDataEvent } from "./browse_data";
import type { CleanupEvent } from "./cleanup";
import type { CsvUploadEvent } from "./csv-upload";
import type { DashboardEvent } from "./dashboard";
import type { DatabaseEvent } from "./database";
import type { DownloadsEvent } from "./downloads";
import type { EmbedFlowEvent } from "./embed-flow";
import type { EmbedShareEvent } from "./embed-share";
import type { EmbeddingHomepageEvent } from "./embedding-homepage";
import type { SimpleEvent } from "./event";
import type { InviteEvent } from "./invite";
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
  csvupload: CsvUploadEvent;
  dashboard: DashboardEvent;
  database: DatabaseEvent;
  downloads: DownloadsEvent;
  embed_flow: EmbedFlowEvent;
  embed_share: EmbedShareEvent;
  embedding_homepage: EmbeddingHomepageEvent;
  simple_event: SimpleEvent;
  invite: InviteEvent;
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
