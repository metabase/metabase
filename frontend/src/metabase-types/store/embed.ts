export interface EmbedOptions {
  top_nav?: boolean;
  search?: boolean;
  new_button?: boolean;
  side_nav?: boolean | "default";
  header?: boolean;
  additional_info?: boolean;
  action_buttons?: boolean;
  font?: string;
}

export interface EmbedState {
  options: EmbedOptions;
}
