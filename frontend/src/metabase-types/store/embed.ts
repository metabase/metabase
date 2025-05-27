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
  /**
   * There might be a cleaner way to say this is in a search parameter
   * but it's not in the embed reducer, than making this optional.
   */
  entity_types?: EmbeddingEntityType[];
}

type EmptyObject = Record<string, never>;
export interface EmbedState {
  options: InteractiveEmbeddingOptions | EmptyObject;
  isEmbeddingSdk?: boolean;
}
