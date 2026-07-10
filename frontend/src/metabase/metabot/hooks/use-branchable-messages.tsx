import { type ReactNode, useMemo, useState } from "react";

import { MetabotBranchPicker } from "metabase/metabot/components/MetabotBranchPicker";
import type { MetabotChatMessage } from "metabase/metabot/state/types";
import {
  type ParentedChatMessage,
  activeResponses,
} from "metabase/metabot/utils/message-tree";

type ActiveResponse = ReturnType<typeof activeResponses>[number];

export function useBranchableMessages(
  sourceMessages: ParentedChatMessage[],
  { isSlack = false }: { isSlack?: boolean } = {},
): {
  messages: MetabotChatMessage[];
  getExtraAgentActions: (messageId: string) => ReactNode;
} {
  const [selectedReplyByParentId, setSelectedReplyByParentId] = useState<
    Record<string, string>
  >({});

  return useMemo(() => {
    const selectBranch = (parentId: string, replyId: string) =>
      setSelectedReplyByParentId((selected) => ({
        ...selected,
        [parentId]: replyId,
      }));
    const responses = activeResponses(sourceMessages, selectedReplyByParentId, {
      isSlack,
    });
    const branchPickers = buildBranchPickers(responses, selectBranch);

    return {
      messages: responses.flatMap(({ messages }) => messages),
      getExtraAgentActions: (messageId: string) => branchPickers[messageId],
    };
  }, [sourceMessages, selectedReplyByParentId, isSlack]);
}

function buildBranchPickers(
  responses: ActiveResponse[],
  selectBranch: (parentId: string, replyId: string) => void,
): Record<string, ReactNode> {
  const pickers: Record<string, ReactNode> = {};
  for (const { branch, messages } of responses) {
    const lastMessage = messages.at(-1);
    if (!branch || !lastMessage) {
      continue;
    }

    // Agent actions render on the final message in a response.
    pickers[lastMessage.id] = (
      <MetabotBranchPicker
        index={branch.currentIndex}
        count={branch.replyIds.length}
        onChange={(next) =>
          selectBranch(branch.parentId, branch.replyIds[next])
        }
      />
    );
  }
  return pickers;
}
