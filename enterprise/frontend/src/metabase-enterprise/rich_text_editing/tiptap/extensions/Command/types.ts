import type { IconName } from "metabase/ui";

export interface CommandOption {
  icon?: IconName;
  text?: string;
  label: string;
  command: string;
}

export interface CommandSection {
  title?: string;
  items: CommandOption[];
}
