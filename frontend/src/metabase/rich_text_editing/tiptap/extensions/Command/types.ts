import type { Editor } from "@tiptap/core";
import type { ComponentType } from "react";

import type { MenuItem } from "metabase/rich_text_editing/tiptap/extensions/shared/MenuComponents";
import type { IconName } from "metabase-types/api";
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

export interface NewQuestionModalProps {
  onSave: (id: number, name: string) => void;
  onClose: () => void;
}

/**
 * The modals rendered when the user picks a new-question type from the
 * command menu. Supplied by the editor's host surface (the document editor)
 * so this module doesn't need to know how questions get authored.
 */
export interface NewQuestionModals {
  notebook: ComponentType<NewQuestionModalProps>;
  native: ComponentType<NewQuestionModalProps>;
}
