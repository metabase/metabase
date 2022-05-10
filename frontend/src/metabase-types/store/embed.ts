export type EmbedTheme = "light" | "dark";

export interface EmbedOptions {
  top_nav?: boolean;
  side_nav?: boolean | "default";
}

export interface EmbedState {
  options: EmbedOptions;
}
