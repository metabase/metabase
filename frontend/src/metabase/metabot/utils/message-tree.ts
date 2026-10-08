import type { MetabotMessage } from "metabase/metabot/state/types";

export type ParentedMessage = MetabotMessage & {
  parent_message_id: string | null;
};

type BranchIndex = Map<string | null, ParentedMessage[]>;

type SelectedReplyByParentId = Record<string, string>;

const ROOT_KEY = "__root__";

type ResponseBranch = {
  parentId: string;
  currentIndex: number;
  replyIds: string[];
};

export type ActiveResponse = {
  message: MetabotMessage;
  branch: ResponseBranch | null;
};

function indexChildrenByParent(messages: ParentedMessage[]): BranchIndex {
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
): ParentedMessage[] {
  const path: ParentedMessage[] = [];
  let parentId: string | null = null;

  while (true) {
    const siblings = index.get(parentId);
    if (!siblings?.length) {
      return path;
    }

    const selectedId: string | undefined =
      selectedReplyByParentId[parentId ?? ROOT_KEY];
    // Siblings arrive oldest first; default to the newest.
    const node: ParentedMessage =
      siblings.find(({ id }) => id === selectedId) ??
      siblings[siblings.length - 1];
    path.push(node);
    parentId = node.id;
  }
}

export function activeResponses(
  messages: ParentedMessage[],
  selectedReplyByParentId: SelectedReplyByParentId,
): ActiveResponse[] {
  const index = indexChildrenByParent(messages);
  const path = activePath(index, selectedReplyByParentId);
  return path.map((message) => ({
    message,
    branch: branchAt(index, message),
  }));
}

function branchAt(
  index: BranchIndex,
  message: ParentedMessage,
): ResponseBranch | null {
  const siblings = index.get(message.parent_message_id) ?? [];
  if (siblings.length < 2) {
    return null;
  }

  return {
    parentId: message.parent_message_id ?? ROOT_KEY,
    currentIndex: siblings.findIndex(({ id }) => id === message.id),
    replyIds: siblings.map(({ id }) => id),
  };
}
