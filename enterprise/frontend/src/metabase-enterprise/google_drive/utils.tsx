import { useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  useDeleteGsheetsFolderLinkMutation,
  useGetServiceAccountQuery,
} from "metabase-enterprise/api";
import type { GdrivePayload } from "metabase-types/api";

export type ErrorPayload =
  | unknown
  | string
  | { data: { message: string } | { error_message: string } | string }
  | { message: string }
  | { error_message: string };

export function useShowGdrive() {
  const gSheetsEnabled = useSetting("show-google-sheets-integration");
  const hasDwh = useHasTokenFeature("attached_dwh");
  const userIsAdmin = useSelector(getUserIsAdmin);

  const shouldGetServiceAccount = gSheetsEnabled && userIsAdmin && hasDwh;
  const { data: serviceAccount } = useGetServiceAccountQuery(
    shouldGetServiceAccount ? undefined : skipToken,
  );

  const showGdrive = Boolean(
    hasDwh && gSheetsEnabled && userIsAdmin && serviceAccount?.email,
  );

  return showGdrive;
}

export const getStatus = ({
  status,
  error,
}: {
  status: GdrivePayload["status"] | undefined | null;
  error?: unknown | null;
}): GdrivePayload["status"] =>
  match({ error: !!error, status })
    .returnType<GdrivePayload["status"]>()
    .with({ error: true }, () => "error")
    .with({ status: P.string.minLength(1) }, ({ status }) => status)
    .otherwise(() => "not-connected");

/**
 * Custom hook for deleting Google Drive folder links
 *
 * @param options - Optional callbacks for success and error handling
 * @param options.onSuccess - Callback to execute on successful deletion
 * @param options.onError - Callback to execute when an error occurs
 *
 * @returns Object containing:
 *   - errorMessage: Current error message state
 *   - isDeletingFolderLink: Loading state for the delete operation
 *   - onDelete: Function to trigger the delete operation
 *
 * @example
 * ```tsx
 * const { errorMessage, isDeletingFolderLink, onDelete } = useDeleteGdriveFolderLink({
 *   onSuccess: () => console.log('Folder deleted successfully'),
 *   onError: (error) => console.error('Delete failed:', error),
 * });
 *
 * const handleDelete = () => onDelete();
 * ```
 */
export const useDeleteGdriveFolderLink = (options?: {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}) => {
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteFolderLink, { isLoading: isDeletingFolderLink }] =
    useDeleteGsheetsFolderLinkMutation();

  const onDelete = async () => {
    setErrorMessage("");
    await deleteFolderLink()
      .unwrap()
      .then(() => {
        options?.onSuccess?.();
      })
      .catch((response: unknown) => {
        const error = getErrorMessage(
          response,
          // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin only ui
          t`Please check that the folder is shared with the Metabase Service Account.`,
        );
        setErrorMessage(error);
        options?.onError?.(error);
      });
  };

  return {
    errorMessage,
    isDeletingFolderLink,
    onDelete,
  };
};
