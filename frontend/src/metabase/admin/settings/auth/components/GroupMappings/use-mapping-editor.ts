import { useState } from "react";
import { t } from "ttag";

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
  // a failed save that says nothing about the name
  saveError: string | null;
  canSave: boolean;
  isSubmitting: boolean;
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
  // the backend rejects bad names on write, so a failed save marks the name field
  namesValidatedOnSave?: boolean;
}): MappingEditorState {
  const [draft, setDraft] = useState<MappingDraft | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedName = draft?.name.trim() ?? "";
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

  const replaceDraft = (nextDraft: MappingDraft | null) => {
    setSubmitError(null);
    setDraft(nextDraft);
  };

  const save = async () => {
    if (draft == null || !canSave) {
      return;
    }
    const isNewMapping = draft.originalName == null;
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
          successMessage: isNewMapping ? t`Mapping added` : t`Mapping updated`,
          showErrorToast: false,
        },
      );
      if (result.ok) {
        replaceDraft(null);
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
    startNew: () =>
      replaceDraft({ name: "", groupValues: [], originalName: null }),
    startEdit: (name, groupIds) =>
      replaceDraft({
        name,
        groupValues: groupLookup.existingIds(groupIds).map(String),
        originalName: name,
      }),
    change: replaceDraft,
    cancel: () => replaceDraft(null),
    save,
  };
}
