import type {
  EmbeddingDataPicker,
  FullAppEmbeddingEntityType,
} from "./embedding-data-picker";

export interface InteractiveEmbeddingOptions {
  font: string | undefined;
  top_nav: boolean;
  search: boolean;
  new_button: boolean;
  breadcrumbs: boolean;
  logo: boolean;
  side_nav: boolean | "default";
  header: boolean;
  additional_info: boolean;
  action_buttons: boolean;
  data_picker: EmbeddingDataPicker;
  entity_types: FullAppEmbeddingEntityType[];
}

// These 2 properties are saved in embedding-data-picker reducer
export type InteractiveEmbeddingOptionsState = Omit<
  InteractiveEmbeddingOptions,
  "data_picker" | "entity_types"
>;

type EmptyObject = Record<string, never>;
export interface EmbedState {
  options: InteractiveEmbeddingOptionsState | EmptyObject;
}
