import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks/use-toast";
import { useLocation, useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { HelpAssistantConversationId } from "metabase-types/api";

import { useHelpAssistantChatContext } from "./HelpAssistantChatContext";

/**
 * Deletes a saved chat and shows a toast to undo it. When the chat is the one
 * that's open, a new chat starts in its place, and undoing opens it again.
 */
export function useDeleteHelpAssistantChat() {
  const { deleteConversation, restoreConversation } =
    useHelpAssistantChatContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [sendToast] = useToast();

  return useCallback(
    (id: HelpAssistantConversationId) => {
      const isOpen = pathname === Urls.adminHelpChat(id);
      const conversation = deleteConversation(id);
      if (!conversation) {
        return;
      }
      if (isOpen) {
        navigate(Urls.adminHelp());
      }
      sendToast({
        message: t`Chat deleted`,
        actionLabel: t`Undo`,
        actions: [
          () => {
            restoreConversation(id, conversation);
            if (isOpen) {
              navigate(Urls.adminHelpChat(id));
            }
          },
        ],
      });
    },
    [deleteConversation, navigate, pathname, restoreConversation, sendToast],
  );
}
