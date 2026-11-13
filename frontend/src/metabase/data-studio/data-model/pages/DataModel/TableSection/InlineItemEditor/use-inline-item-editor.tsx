import { type ReactNode, useState } from "react";

import * as Lib from "metabase-lib";

import type { TreeItemNode } from "../GroupedItemTree";

import { InlineEditActions, ItemNameInput } from "./InlineItemEditor";

/** A segment's or measure's name and definition, as a list row edits them */
export type ItemDraft = { name: string; query: Lib.Query };

/**
 * A row that saves a new item, one that saves a proposal as a new item, or a
 * saved item's own row
 */
type EditableRowKind = "new" | "proposal" | "saved";

/** Saved edits stay on screen until the list reloads with them */
type StoredDraft = ItemDraft & { isSubmitted: boolean };

const NEW_ITEM_KEY = "new";

type EditableItemOptions = {
  key: string;
  kind: EditableRowKind;
  /** What the row shows without edits */
  saved: ItemDraft;
  namePlaceholder: string;
  isMuted?: boolean;
  isValid: (query: Lib.Query) => boolean;
  renderPicker: (
    query: Lib.Query,
    onChange: (query: Lib.Query) => void,
  ) => ReactNode;
  /** Saves the row; what was saved, or `null` when saving failed */
  onSave: (draft: ItemDraft) => Promise<ItemDraft | null>;
  /** The row's actions while it has no unsaved edits */
  actions?: ReactNode;
};

type EditableItemFields = Required<
  Pick<TreeItemNode, "name" | "nameInput" | "definition" | "isEditing">
> &
  Pick<TreeItemNode, "actions">;

function isDraftChanged(draft: ItemDraft, saved: ItemDraft) {
  return (
    draft.name !== saved.name ||
    !Lib.areLegacyQueriesEqual(
      Lib.toJsQuery(draft.query),
      Lib.toJsQuery(saved.query),
    )
  );
}

/**
 * PROTOTYPE: rows of a segment or measure list that edit in place. Each row
 * keeps its unsaved name and definition here; once they differ from what's
 * saved, the row gets Save and Cancel. One new row at a time sits at the top.
 */
export function useInlineItemEditor() {
  const [drafts, setDrafts] = useState<Partial<Record<string, StoredDraft>>>(
    {},
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const setDraft = (key: string, draft: StoredDraft) =>
    setDrafts((drafts) => ({ ...drafts, [key]: draft }));

  const discardDraft = (key: string) =>
    setDrafts((drafts) => {
      const rest = { ...drafts };
      delete rest[key];
      return rest;
    });

  const saveDraft = async (
    { key, kind, onSave }: EditableItemOptions,
    draft: ItemDraft,
  ) => {
    setSavingKey(key);
    const savedDraft = await onSave(draft);
    setSavingKey(null);
    if (!savedDraft) {
      return;
    }
    // New items and accepted proposals leave their rows, which go
    if (kind === "saved") {
      setDraft(key, { ...savedDraft, isSubmitted: true });
    } else {
      discardDraft(key);
    }
  };

  const getEditableItem = (
    options: EditableItemOptions,
  ): EditableItemFields => {
    const { key, kind, saved } = options;
    const stored = drafts[key];
    const draft = stored && !stored.isSubmitted ? stored : undefined;
    const submitted =
      stored?.isSubmitted && isDraftChanged(stored, saved) ? stored : undefined;
    const current = draft ?? submitted ?? saved;
    const isChanged =
      kind === "new" || (draft != null && isDraftChanged(draft, saved));
    const update = (change: Partial<ItemDraft>) =>
      setDraft(key, { ...current, ...change, isSubmitted: false });

    return {
      name: current.name,
      nameInput: (
        <ItemNameInput
          value={current.name}
          placeholder={options.namePlaceholder}
          isMuted={options.isMuted && !isChanged}
          autoFocus={kind === "new"}
          onChange={(name) => update({ name })}
        />
      ),
      // `Required` drops `undefined` from the node's definition type
      definition:
        options.renderPicker(current.query, (query) => update({ query })) ??
        null,
      actions: isChanged ? (
        <InlineEditActions
          canSave={options.isValid(current.query)}
          isSaving={savingKey === key}
          onSave={() => saveDraft(options, current)}
          onCancel={() => discardDraft(key)}
        />
      ) : (
        options.actions
      ),
      isEditing: isChanged,
    };
  };

  return {
    getEditableItem,
    /** The new row's key, while there is one */
    newItemKey: drafts[NEW_ITEM_KEY] ? NEW_ITEM_KEY : null,
    /** Opens a new row at the top, starting from the table's query */
    startNewItem: (query: Lib.Query) =>
      setDraft(NEW_ITEM_KEY, { name: "", query, isSubmitted: false }),
  };
}
