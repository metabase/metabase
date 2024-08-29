import type { ValidateSchema } from "./utils";

type BrowseDataEventSchema = {
  event: string;
  model_id?: number | null;
  table_id?: number | null;
};

type ValidateEvent<T extends BrowseDataEventSchema> = ValidateSchema<
  T,
  BrowseDataEventSchema
>;

export type BrowseDataModelClickedEvent = ValidateEvent<{
  event: "browse_data_model_clicked";
  model_id: number;
}>;

export type BrowseDataTableClickedEvent = ValidateEvent<{
  event: "browse_data_table_clicked";
  table_id: number;
}>;

export type BrowseDataEvent =
  | BrowseDataModelClickedEvent
  | BrowseDataTableClickedEvent;
