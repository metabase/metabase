import { useState } from "react";
import { t } from "ttag";

import type { GroupId } from "metabase-types/api";

import type { GroupMappingsState } from "./use-group-mappings";
import { type GroupLookup, withMappingEntry } from "./utils";

export type MappingDraft = {
  name: string;
  // MultiSelect values, so group ids as strings
  groupValues: string[];
  // set while an existing mapping is being edited
  originalName: string | null;
};

export type MappingEditorState = {
  draft: MappingDraft | null;
  // what is wrong with the name, whether a duplicate here or a rejection by the backend
  nameError: string | null;
  canSave: boolean;
  startNew: () => void;
  startEdit: (name: string, groupIds: GroupId[]) => void;
  change: (draft: MappingDraft) => void;
  cancel: () => void;
  save: () => Promise<void>;
};

/** Holds the mapping being added or edited and writes it into the mappings setting */
export function useMappingEditor({
  groupMapping,
  groupLookup,
}: {
  groupMapping: GroupMappingsState;
  groupLookup: GroupLookup;
}): MappingEditorState {
  const [draft, setDraft] = useState<MappingDraft | null>(null);
  // why the last submit did not go through, kept until the draft changes
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trimmedName = draft?.name.trim() ?? "";
  const isDuplicateName =
    draft != null &&
    Object.hasOwn(groupMapping.mappings, trimmedName) &&
    trimmedName !== draft.originalName;
  const canSave =
    draft != null &&
    trimmedName !== "" &&
    draft.groupValues.length > 0 &&
    !isDuplicateName;
  let nameError: string | null = null;
  if (isDuplicateName) {
    nameError = t`A mapping for this group already exists`;
  } else if (submitError != null) {
    nameError = submitError;
  }

  // a fresh or edited draft starts without a stale failure
  const replaceDraft = (nextDraft: MappingDraft | null) => {
    setSubmitError(null);
    setDraft(nextDraft);
  };

  const save = async () => {
    if (draft == null || !canSave) {
      return;
    }
    const isNewMapping = draft.originalName == null;
    const result = await groupMapping.saveMappings(
      withMappingEntry(
        groupMapping.mappings,
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
  };

  return {
    draft,
    nameError,
    canSave,
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
