import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { GroupId, GroupMappings } from "metabase-types/api";

import type { SaveMappings } from "./use-group-mappings";
import { type GroupLookup, withMappingEntry } from "./utils";

export type MappingDraft = {
  name: string;
  // MultiSelect values, so group ids as strings
  groupValues: string[];
  originalName: string | null;
};

export type MappingEditorState = {
  draft: MappingDraft | null;
  nameError: string | null;
  saveError: string | null;
  canSave: boolean;
  isSubmitting: boolean;
  isDraftNew: boolean;
  hasUnsavedChanges: boolean;
  startNew: () => void;
  startEdit: (name: string, groupIds: GroupId[]) => void;
  change: (draft: MappingDraft) => void;
  cancel: () => void;
  save: () => Promise<void>;
};

/** Holds the mapping being added or edited and writes it into the mappings setting */
export function useMappingEditor({
  mappings,
  saveMappings,
  groupLookup,
  namesValidatedOnSave = false,
}: {
  mappings: GroupMappings;
  saveMappings: SaveMappings;
  groupLookup: GroupLookup;
  namesValidatedOnSave?: boolean;
}): MappingEditorState {
  const [draft, setDraft] = useState<MappingDraft | null>(null);
  const [openedDraft, setOpenedDraft] = useState<MappingDraft | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedName = draft?.name.trim() ?? "";
  const isDraftNew =
    draft != null &&
    (draft.originalName == null ||
      !Object.hasOwn(mappings, draft.originalName));
  const hasUnsavedChanges = draft != null && !_.isEqual(draft, openedDraft);
  const isDuplicateName =
    draft != null &&
    Object.hasOwn(mappings, trimmedName) &&
    trimmedName !== draft.originalName;
  const canSave =
    draft != null &&
    trimmedName !== "" &&
    draft.groupValues.length > 0 &&
    !isDuplicateName;
  let nameError: string | null = null;
  if (isDuplicateName) {
    nameError = t`A mapping for this group already exists`;
  } else if (namesValidatedOnSave) {
    nameError = submitError;
  }
  const saveError = namesValidatedOnSave ? null : submitError;

  const changeDraft = (nextDraft: MappingDraft | null) => {
    setSubmitError(null);
    setDraft(nextDraft);
  };

  const resetDraft = (nextDraft: MappingDraft | null) => {
    setOpenedDraft(nextDraft);
    changeDraft(nextDraft);
  };

  const save = async () => {
    if (draft == null || !canSave) {
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await saveMappings(
        withMappingEntry(
          mappings,
          draft.originalName,
          trimmedName,
          draft.groupValues.map(Number),
        ),
        {
          successMessage: isDraftNew ? t`Mapping added` : t`Mapping updated`,
          showErrorToast: false,
        },
      );
      if (result.ok) {
        resetDraft(null);
      } else {
        setSubmitError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    draft,
    nameError,
    saveError,
    canSave,
    isSubmitting,
    isDraftNew,
    hasUnsavedChanges,
    startNew: () =>
      resetDraft({ name: "", groupValues: [], originalName: null }),
    startEdit: (name, groupIds) =>
      resetDraft({
        name,
        groupValues: groupLookup.existingIds(groupIds).map(String),
        originalName: name,
      }),
    change: changeDraft,
    cancel: () => resetDraft(null),
    save,
  };
}
