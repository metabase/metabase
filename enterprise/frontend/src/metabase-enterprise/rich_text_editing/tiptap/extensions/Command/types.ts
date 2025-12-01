import type { Editor } from "@tiptap/core";

import type { IconName } from "metabase/ui";
import type { MenuItem } from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";

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
