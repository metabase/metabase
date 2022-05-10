export interface EmbedOptions {
  top_nav?: boolean;
  search?: boolean;
  new_button?: boolean;
  side_nav?: boolean | "default";
  header?: boolean;
  additional_info?: boolean;
}

export interface EmbedState {
  options: EmbedOptions;
}
