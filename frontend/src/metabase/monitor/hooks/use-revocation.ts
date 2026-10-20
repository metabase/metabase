import { useCallback } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";

type RevocationResult = {
  revoked: number;
  remaining: number;
};

type RevokeTrigger<TRequest> = (request: TRequest) => {
  unwrap: () => Promise<RevocationResult>;
};

/** Functions, not strings, so each caller keeps its own `ngettext` call for the translation extractor. */
type RevocationMessages = {
  revoked: (count: number) => string;
  raced: (count: number) => string;
  failed: string;
};

export type RevokeConfirmation<TRequest> = {
  title: string;
  message: string;
  request: TRequest;
};

type UseRevocationOptions<TRequest> = {
  revoke: RevokeTrigger<TRequest>;
  messages: RevocationMessages;
  onRevoked: (request: TRequest) => void;
};

/** Confirm, revoke, then toast the result. `isRevoking` comes from the caller's own mutation. */
export function useRevocation<TRequest>({
  revoke,
  messages,
  onRevoked,
}: UseRevocationOptions<TRequest>) {
  const dispatch = useDispatch();
  const { modalContent: confirmModal, show: showConfirm } = useConfirmation();
  // `messages` is a new object every render, so a ref keeps the callbacks below stable
  const messagesRef = useLatest(messages);

  const run = useCallback(
    async (request: TRequest) => {
      try {
        const { revoked, remaining } = await revoke(request).unwrap();
        dispatch(addUndo({ message: messagesRef.current.revoked(revoked) }));
        if (remaining > 0) {
          dispatch(
            addUndo({
              variant: "warning",
              message: messagesRef.current.raced(remaining),
            }),
          );
        }
        onRevoked(request);
      } catch (error) {
        dispatch(
          addUndo({
            variant: "negative",
            message: getErrorMessage(error, messagesRef.current.failed),
          }),
        );
      }
    },
    [dispatch, messagesRef, onRevoked, revoke],
  );

  const confirmRevoke = useCallback(
    ({ title, message, request }: RevokeConfirmation<TRequest>) => {
      showConfirm({
        title,
        message,
        confirmButtonText: t`Revoke`,
        onConfirm: () => run(request),
      });
    },
    [run, showConfirm],
  );

  return { confirmModal, confirmRevoke };
}
