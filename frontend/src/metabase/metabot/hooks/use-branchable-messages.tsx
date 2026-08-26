import { type ReactNode, useMemo, useState } from "react";

import { MetabotBranchPicker } from "metabase/metabot/components/MetabotBranchPicker";
import type {
  MetabotChatMessage,
  MetabotMessage,
  MetabotMessageOutcome,
  MetabotMessagePart,
} from "metabase/metabot/state/types";
import {
  type ParentedChatMessage,
  activeResponses,
} from "metabase/metabot/utils/message-tree";

type ActiveResponse = ReturnType<typeof activeResponses>[number];

const getOutcome = (
  marker: MetabotChatMessage | undefined,
): MetabotMessageOutcome => {
  switch (marker?.type) {
    case "turn_errored":
      return { type: "errored", error: marker.error, display: marker.display };
    case "turn_aborted":
      return { type: "aborted" };
    case "turn_incomplete":
      return {
        type: "incomplete",
        finishReason: marker.finishReason,
        contextWindowFull: marker.contextWindowFull,
      };
    case "turn_in_progress":
      return { type: "in_progress" };
    default:
      return { type: "done" };
  }
};

const isOutcomeMarker = (message: MetabotChatMessage) =>
  message.type === "turn_errored" ||
  message.type === "turn_aborted" ||
  message.type === "turn_incomplete" ||
  message.type === "turn_in_progress";

const responseToMessage = (response: ActiveResponse): MetabotMessage => {
  const parts = response.messages.filter(
    (message): message is MetabotMessagePart => !isOutcomeMarker(message),
  );
  const withExternalId = response.messages.find(
    (message) => "externalId" in message && message.externalId,
  );
  return {
    id: response.messages[0].id,
    externalId:
      withExternalId && "externalId" in withExternalId
        ? withExternalId.externalId
        : undefined,
    role: response.messages[0].role,
    parts,
    outcome: getOutcome(response.messages.find(isOutcomeMarker)),
  };
};

export function useBranchableMessages(
  sourceMessages: ParentedChatMessage[],
  { isSlack = false }: { isSlack?: boolean } = {},
): {
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
    const responses = activeResponses(sourceMessages, selectedReplyByParentId, {
      isSlack,
    });
    const messages = responses.map(responseToMessage);
    const branchPickers = buildBranchPickers(responses, messages, selectBranch);

    return {
      messages,
      getExtraActions: (messageId: string) => branchPickers[messageId],
    };
  }, [sourceMessages, selectedReplyByParentId, isSlack]);
}

function buildBranchPickers(
  responses: ActiveResponse[],
  messages: MetabotMessage[],
  selectBranch: (parentId: string, replyId: string) => void,
): Record<string, ReactNode> {
  const pickers: Record<string, ReactNode> = {};
  responses.forEach(({ branch }, index) => {
    if (!branch) {
      return;
    }

    // Agent actions render on the final message in a response.
    pickers[messages[index].id] = (
      <MetabotBranchPicker
        index={branch.currentIndex}
        count={branch.replyIds.length}
        onChange={(next) =>
          selectBranch(branch.parentId, branch.replyIds[next])
        }
      />
    );
  });
  return pickers;
}
