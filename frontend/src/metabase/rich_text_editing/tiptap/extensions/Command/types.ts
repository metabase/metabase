import type { Editor } from "@tiptap/core";

import type { MenuItem } from "metabase/documents/components/Editor/shared/MenuComponents";
import type { IconName } from "metabase/ui";

export interface CommandOption {
  icon?: IconName;
  text?: string;
  label: string;
  command: string;
  isAllowedAtPosition?: (editor: Editor) => boolean;
}

export interface CommandSection {
  title?: string;
  items: CommandOption[];
}

export interface NewQuestionMenuItem extends MenuItem {
  value: "native" | "notebook";
}
