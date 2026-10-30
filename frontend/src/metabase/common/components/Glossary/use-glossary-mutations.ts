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

type GlossaryMutationCallbacks = {
  onCreated?: (id: GlossaryItem["id"]) => void;
  onUpdated?: (id: GlossaryItem["id"]) => void;
  onDeleted?: (id: GlossaryItem["id"]) => void;
};

/**
 * Creates, updates, and deletes glossary entries, reporting each outcome in a toast.
 * `createTerm` resolves to whether the term was saved.
 */
export function useGlossaryMutations({
  onCreated,
  onUpdated,
  onDeleted,
}: GlossaryMutationCallbacks = {}) {
  const [createGlossary] = useCreateGlossaryMutation();
  const [updateGlossary] = useUpdateGlossaryMutation();
  const [deleteGlossary] = useDeleteGlossaryMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const createTerm = async (draft: CreateGlossaryRequest) => {
    try {
      const item = await createGlossary(draft).unwrap();
      sendSuccessToast(t`Term added`);
      onCreated?.(item.id);
      return true;
    } catch (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to add term`));
      return false;
    }
  };

  const updateTerm = async (request: UpdateGlossaryRequest) => {
    try {
      await updateGlossary(request).unwrap();
      sendSuccessToast(t`Term updated`);
      onUpdated?.(request.id);
    } catch (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to update term`));
    }
  };

  const deleteTerm = async (id: GlossaryItem["id"]) => {
    try {
      await deleteGlossary({ id }).unwrap();
      sendSuccessToast(t`Term deleted`);
      onDeleted?.(id);
    } catch (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to delete term`));
    }
  };

  return { createTerm, updateTerm, deleteTerm };
}
