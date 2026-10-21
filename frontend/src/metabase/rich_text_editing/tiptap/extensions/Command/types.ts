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
  /** Runs in place of the built-in handling of `command`, once the typed query is removed. */
  run?: (editor: Editor) => void;
}

export interface CommandSection {
  title?: string;
  items: CommandOption[];
}

export type NewQuestionType = "ai" | "event-analysis" | "notebook" | "native";

export type NewQuestionModalType = Extract<
  NewQuestionType,
  "notebook" | "native"
>;

export interface NewQuestionMenuItem extends MenuItem {
  value: NewQuestionType;
}

export interface NewQuestionOption {
  value: NewQuestionType;
  label: string;
  icon: IconName;
}

export interface NewQuestionModalProps {
  onSave: (id: number, name: string) => void;
  onClose: () => void;
}

export interface NewQuestionModals {
  notebook: ComponentType<NewQuestionModalProps>;
  native: ComponentType<NewQuestionModalProps>;
}
