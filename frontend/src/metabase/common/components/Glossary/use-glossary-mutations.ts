import { t } from "ttag";

import {
  type CreateGlossaryRequest,
  type GlossaryItem,
  type UpdateGlossaryRequest,
  useCreateGlossaryMutation,
  useDeleteGlossaryMutation,
  useUpdateGlossaryMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataToasts } from "metabase/common/hooks";

export type UseGlossaryMutationsOptions = {
  onCreated?: (id: GlossaryItem["id"]) => void;
  onUpdated?: (id: GlossaryItem["id"]) => void;
  onDeleted?: (id: GlossaryItem["id"]) => void;
};

type UseGlossaryMutationsResult = {
  /** Resolves to whether the term was saved. */
  createTerm: (draft: CreateGlossaryRequest) => Promise<boolean>;
  updateTerm: (request: UpdateGlossaryRequest) => Promise<void>;
  deleteTerm: (id: GlossaryItem["id"]) => Promise<void>;
};

/** Creates, updates, and deletes glossary entries, reporting each outcome in a toast. */
export function useGlossaryMutations({
  onCreated,
  onUpdated,
  onDeleted,
}: UseGlossaryMutationsOptions = {}): UseGlossaryMutationsResult {
  const [createGlossary] = useCreateGlossaryMutation();
  const [updateGlossary] = useUpdateGlossaryMutation();
  const [deleteGlossary] = useDeleteGlossaryMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const createTerm = async (draft: CreateGlossaryRequest) => {
    const { data, error } = await createGlossary(draft);
    if (data == null) {
      sendErrorToast(getErrorMessage(error, t`Failed to add term`));
      return false;
    }
    sendSuccessToast(t`Term added`);
    onCreated?.(data.id);
    return true;
  };

  const updateTerm = async (request: UpdateGlossaryRequest) => {
    const { error } = await updateGlossary(request);
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to update term`));
      return;
    }
    sendSuccessToast(t`Term updated`);
    onUpdated?.(request.id);
  };

  const deleteTerm = async (id: GlossaryItem["id"]) => {
    const { error } = await deleteGlossary({ id });
    if (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to delete term`));
      return;
    }
    sendSuccessToast(t`Term deleted`);
    onDeleted?.(id);
  };

  return { createTerm, updateTerm, deleteTerm };
}
