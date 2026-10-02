import { useCallback } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";

/** What every Monitor revoke endpoint answers with: how many it revoked, and how many raced in behind it. */
type RevocationResult = {
  revoked: number;
  remaining: number;
};

/** An RTK Query mutation trigger for a revoke endpoint. */
type RevokeTrigger<TRequest> = (request: TRequest) => {
  unwrap: () => Promise<RevocationResult>;
};

/**
 * The feature's own wording. Counted messages are built here rather than passed as strings so each caller keeps its
 * own `ngettext` call, which is what the translation extractor reads.
 */
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

/**
 * The confirm-then-revoke-then-toast flow the Monitor credential pages share: a confirmation modal, the mutation, an
 * undo toast reporting the count, a warning toast when something raced the revoke, and a warning toast on failure.
 *
 * `isRevoking` is not returned: the caller holds the mutation and already has its loading flag.
 */
export function useRevocation<TRequest>({
  revoke,
  messages,
  onRevoked,
}: UseRevocationOptions<TRequest>) {
  const dispatch = useDispatch();
  const { modalContent: confirmModal, show: showConfirm } = useConfirmation();
  // The caller builds `messages` inline, so it is a new object every render; a ref keeps the callbacks below stable.
  const messagesRef = useLatest(messages);

  const run = useCallback(
    async (request: TRequest) => {
      try {
        const { revoked, remaining } = await revoke(request).unwrap();
        dispatch(addUndo({ message: messagesRef.current.revoked(revoked) }));
        if (remaining > 0) {
          dispatch(
            addUndo({
              icon: "warning",
              message: messagesRef.current.raced(remaining),
            }),
          );
        }
        onRevoked(request);
      } catch {
        dispatch(
          addUndo({ icon: "warning", message: messagesRef.current.failed }),
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
