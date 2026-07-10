import type { MetabotChatMessage } from "metabase/metabot/state/types";

import {
  type FetchedChatMessage,
  normalizeFetchedChatMessages,
} from "./normalize-fetched-chat-messages";

// The backend can return a conversation as a flat list of messages, each
// pointing at its parent. That makes a tree: a prompt's replies are its
// children, and a regenerated reply is just another child sharing the same
// parent. This module rebuilds that tree and walks one path through it.

// A fetched chat message annotated with its parent, so the flat list forms a tree.
export type ParentedChatMessage = FetchedChatMessage & {
  parent_message_id: string | null;
};

type TreeNode = { id: string; parent_message_id: string | null };

// Children grouped under each parent id (null holds the roots), preserving the
// backend's oldest-to-newest order.
export type BranchIndex<T extends TreeNode> = Map<string | null, T[]>;

// The reply chosen at each branch point: parent id → chosen child id. A branch
// left unset defaults to the newest reply.
export type SelectedBranch = Record<string, string>;

// Which reply is showing at a branch point, and its alternatives, so a picker
// can page between them.
export type BranchChoice = {
  parentId: string;
  currentIndex: number;
  siblingIds: string[];
};

// One response along the active path: its rendered messages, plus the branch it
// belongs to when the prompt was answered more than once.
export type ActiveResponse = {
  messages: MetabotChatMessage[];
  branch: BranchChoice | null;
};

export function indexChildrenByParent<T extends TreeNode>(
  nodes: T[],
): BranchIndex<T> {
  return nodes.reduce<BranchIndex<T>>((index, node) => {
    const siblings = index.get(node.parent_message_id) ?? [];
    return index.set(node.parent_message_id, [...siblings, node]);
  }, new Map());
}

// Walk from the root, taking the selected (or newest) reply at each branch, into
// the flat list of messages on the active path. An older reply has no children,
// so choosing it naturally truncates everything downstream.
export function activePath<T extends TreeNode>(
  index: BranchIndex<T>,
  selected: SelectedBranch,
  parentId: string | null = null,
): T[] {
  const children = index.get(parentId) ?? [];
  if (children.length === 0) {
    return [];
  }
  const node = chooseReply(children, selected);
  return [node, ...activePath(index, selected, node.id)];
}

export function activeResponses(
  index: BranchIndex<ParentedChatMessage>,
  selected: SelectedBranch,
  { isSlack }: { isSlack: boolean },
): ActiveResponse[] {
  const path = activePath(index, selected);
  return groupIntoResponses(path).map((response) => ({
    messages: normalizeFetchedChatMessages(response, { isSlack }),
    branch: branchAt(index, response),
  }));
}

function chooseReply<T extends TreeNode>(
  siblings: T[],
  selected: SelectedBranch,
): T {
  const newest = siblings[siblings.length - 1];
  const parentId = siblings[0].parent_message_id;
  const chosenId = parentId == null ? undefined : selected[parentId];
  return siblings.find((sibling) => sibling.id === chosenId) ?? newest;
}

// Split the path into responses: each user prompt stands alone, and its agent
// reply (one or more chained blocks) groups into a single response.
function groupIntoResponses(
  path: ParentedChatMessage[],
): ParentedChatMessage[][] {
  return path.reduce<ParentedChatMessage[][]>((responses, node) => {
    const current = responses[responses.length - 1];
    const continuesReply =
      current?.[0].role === "agent" && node.role === "agent";
    return continuesReply
      ? [...responses.slice(0, -1), [...current, node]]
      : [...responses, [node]];
  }, []);
}

function branchAt(
  index: BranchIndex<ParentedChatMessage>,
  response: ParentedChatMessage[],
): BranchChoice | null {
  const [head] = response;
  const siblings = index.get(head.parent_message_id) ?? [];
  const isRegenerated =
    head.role === "agent" &&
    head.parent_message_id != null &&
    siblings.length > 1;
  if (!isRegenerated) {
    return null;
  }
  return {
    parentId: head.parent_message_id as string,
    currentIndex: siblings.indexOf(head),
    siblingIds: siblings.map((sibling) => sibling.id),
  };
}
