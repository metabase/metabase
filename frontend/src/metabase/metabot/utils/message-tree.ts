import type { MetabotChatMessage } from "metabase/metabot/state/types";

import {
  type FetchedChatMessage,
  normalizeFetchedChatMessages,
} from "./normalize-fetched-chat-messages";

export type ParentedChatMessage = FetchedChatMessage & {
  parent_message_id: string | null;
};

type BranchIndex = Map<string | null, ParentedChatMessage[]>;

type SelectedReplyByParentId = Record<string, string>;

type ResponseBranch = {
  parentId: string;
  currentIndex: number;
  replyIds: string[];
};

type ActiveResponse = {
  messages: MetabotChatMessage[];
  branch: ResponseBranch | null;
};

function indexChildrenByParent(messages: ParentedChatMessage[]): BranchIndex {
  const index: BranchIndex = new Map();
  for (const message of messages) {
    const siblings = index.get(message.parent_message_id);
    if (siblings) {
      siblings.push(message);
    } else {
      index.set(message.parent_message_id, [message]);
    }
  }
  return index;
}

function activePath(
  index: BranchIndex,
  selectedReplyByParentId: SelectedReplyByParentId,
): ParentedChatMessage[] {
  const path: ParentedChatMessage[] = [];
  let parentId: string | null = null;

  while (true) {
    const siblings = index.get(parentId);
    if (!siblings?.length) {
      return path;
    }

    const selectedId: string | undefined =
      parentId === null ? undefined : selectedReplyByParentId[parentId];
    // Siblings arrive oldest first; default to the newest.
    const node: ParentedChatMessage =
      siblings.find(({ id }) => id === selectedId) ??
      siblings[siblings.length - 1];
    path.push(node);
    parentId = node.id;
  }
}

export function activeResponses(
  messages: ParentedChatMessage[],
  selectedReplyByParentId: SelectedReplyByParentId,
  { isSlack }: { isSlack: boolean },
): ActiveResponse[] {
  const index = indexChildrenByParent(messages);
  const path = activePath(index, selectedReplyByParentId);
  return groupIntoResponses(path).map((response) => ({
    messages: normalizeFetchedChatMessages(response, { isSlack }),
    branch: branchAt(index, response),
  }));
}

function groupIntoResponses(
  path: ParentedChatMessage[],
): ParentedChatMessage[][] {
  const responses: ParentedChatMessage[][] = [];
  for (const node of path) {
    const current = responses.at(-1);
    if (current?.[0].role === "agent" && node.role === "agent") {
      current.push(node);
    } else {
      responses.push([node]);
    }
  }
  return responses;
}

function branchAt(
  index: BranchIndex,
  response: ParentedChatMessage[],
): ResponseBranch | null {
  const head = response[0];
  const parentId = head.parent_message_id;
  if (head.role !== "agent" || parentId === null) {
    return null;
  }

  const siblings = index.get(head.parent_message_id) ?? [];
  if (siblings.length < 2) {
    return null;
  }

  return {
    parentId,
    currentIndex: siblings.findIndex(({ id }) => id === head.id),
    replyIds: siblings.map(({ id }) => id),
  };
}
