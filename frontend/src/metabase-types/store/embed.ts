export interface EmbedOptions {
  top_nav?: boolean;
  search?: boolean;
  new_button?: boolean;
  side_nav?: boolean | "default";
}

export interface EmbedState {
  options: EmbedOptions;
}
