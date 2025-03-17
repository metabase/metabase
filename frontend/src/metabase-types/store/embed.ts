import type { EmbeddingEntityType } from "metabase/embedding-sdk/store";

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
  entity_types: EmbeddingEntityType[];
}

type EmptyObject = Record<string, never>;
export interface EmbedState {
  options: InteractiveEmbeddingOptions | EmptyObject;
  isEmbeddingSdk?: boolean;
}
