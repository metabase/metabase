import { type ReactNode, useMemo, useState } from "react";

import { MetabotBranchPicker } from "metabase/metabot/components/MetabotBranchPicker";
import type { MetabotMessage } from "metabase/metabot/state/types";
import {
  type ActiveResponse,
  type ParentedMessage,
  activeResponses,
} from "metabase/metabot/utils/message-tree";

export function useBranchableMessages(sourceMessages: ParentedMessage[]): {
  messages: MetabotMessage[];
  getExtraActions: (messageId: string) => ReactNode;
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
    const responses = activeResponses(sourceMessages, selectedReplyByParentId);
    const messages = responses.map(({ message }) => message);
    const branchPickers = buildBranchPickers(responses, selectBranch);

    return {
      messages,
      getExtraActions: (messageId: string) => branchPickers[messageId],
    };
  }, [sourceMessages, selectedReplyByParentId]);
}

function buildBranchPickers(
  responses: ActiveResponse[],
  selectBranch: (parentId: string, replyId: string) => void,
): Record<string, ReactNode> {
  const pickers: Record<string, ReactNode> = {};
  for (const { message, branch } of responses) {
    if (!branch) {
      continue;
    }

    pickers[message.id] = (
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
