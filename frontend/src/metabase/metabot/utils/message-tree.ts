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

const ROOT_KEY = "__root__";

type ResponseBranch = {
  parentId: string;
  currentIndex: number;
  replyIds: string[];
};

type ActiveResponse = {
  messages: MetabotChatMessage[];
  branch: ResponseBranch | null;
};

function externalIdOf(message: ParentedChatMessage): string | undefined {
  return "externalId" in message ? message.externalId : undefined;
}

export function forkBoundaryAttemptIds(
  messages: ParentedChatMessage[],
  boundaryExternalId: string,
): Set<string> {
  const boundary = messages.find(
    (message) => externalIdOf(message) === boundaryExternalId,
  );
  if (!boundary) {
    return new Set([boundaryExternalId]);
  }

  const byId = new Map(messages.map((message) => [message.id, message]));
  let head = boundary;
  while (head.parent_message_id != null) {
    const parent = byId.get(head.parent_message_id);
    if (!parent || parent.role !== "agent") {
      break;
    }
    head = parent;
  }

  const attemptIds = messages
    .filter(
      (message) =>
        message.role === "agent" &&
        message.parent_message_id === head.parent_message_id,
    )
    .map(externalIdOf)
    .filter((id): id is string => id != null);

  return attemptIds.length > 0
    ? new Set(attemptIds)
    : new Set([boundaryExternalId]);
}

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
      selectedReplyByParentId[parentId ?? ROOT_KEY];
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
  const siblings = index.get(head.parent_message_id) ?? [];
  if (siblings.length < 2) {
    return null;
  }

  return {
    parentId: head.parent_message_id ?? ROOT_KEY,
    currentIndex: siblings.findIndex(({ id }) => id === head.id),
    replyIds: siblings.map(({ id }) => id),
  };
}
