export interface InteractiveEmbeddingOptions {
  font?: string;
  top_nav?: boolean;
  search?: boolean;
  new_button?: boolean;
  breadcrumbs?: boolean;
  logo?: boolean;
  side_nav?: boolean | "default";
  header?: boolean;
  additional_info?: boolean;
  action_buttons?: boolean;
  multi_stage_data_picker?: boolean;
}

export interface EmbedState {
  options: InteractiveEmbeddingOptions;
  isEmbeddingSdk?: boolean;
}
