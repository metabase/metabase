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
  entity_types: EntityType[];
}

type EntityType = "model" | "table";

export interface EmbedState {
  options: InteractiveEmbeddingOptions;
  isEmbeddingSdk?: boolean;
}
