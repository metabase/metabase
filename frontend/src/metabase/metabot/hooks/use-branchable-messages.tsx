import { type ReactNode, useCallback, useMemo, useState } from "react";

import { MetabotBranchPicker } from "metabase/metabot/components/MetabotBranchPicker";
import type { MetabotChatMessage } from "metabase/metabot/state/types";
import {
  type ActiveResponse,
  type ParentedChatMessage,
  type SelectedBranch,
  activeResponses,
  indexChildrenByParent,
} from "metabase/metabot/utils/message-tree";

// Turns a flat parent-pointer message list into the transcript to render, walking
// one path through its branches. Each regenerated reply gets a picker to page its
// siblings; other consumers stay branch-free since a single reply never branches.
export function useBranchableMessages(
  nodes: ParentedChatMessage[],
  { isSlack = false }: { isSlack?: boolean } = {},
): {
  messages: MetabotChatMessage[];
  getExtraAgentActions: (message: MetabotChatMessage) => ReactNode;
} {
  // Which reply is selected at each branch point; unset branches show the newest.
  const [selectedBranch, setSelectedBranch] = useState<SelectedBranch>({});
  const selectBranch = useCallback(
    (parentId: string, replyId: string) =>
      setSelectedBranch((prev) => ({ ...prev, [parentId]: replyId })),
    [],
  );

  const responses = useMemo(
    () =>
      activeResponses(indexChildrenByParent(nodes), selectedBranch, {
        isSlack,
      }),
    [nodes, selectedBranch, isSlack],
  );
  const messages = useMemo(
    () => responses.flatMap((response) => response.messages),
    [responses],
  );
  const pickerById = useMemo(
    () => buildBranchPickers(responses, selectBranch),
    [responses, selectBranch],
  );
  const getExtraAgentActions = useCallback(
    (message: MetabotChatMessage) => pickerById[message.id],
    [pickerById],
  );

  return { messages, getExtraAgentActions };
}

// Map each branched response's last message to a picker that pages its siblings.
function buildBranchPickers(
  responses: ActiveResponse[],
  selectBranch: (parentId: string, replyId: string) => void,
): Record<string, ReactNode> {
  return Object.fromEntries(
    responses.flatMap(({ branch, messages }) => {
      const lastMessage = messages.at(-1);
      if (!branch || !lastMessage) {
        return [];
      }
      const picker = (
        <MetabotBranchPicker
          index={branch.currentIndex}
          count={branch.siblingIds.length}
          onChange={(next) =>
            selectBranch(branch.parentId, branch.siblingIds[next])
          }
        />
      );
      return [[lastMessage.id, picker]];
    }),
  );
}
