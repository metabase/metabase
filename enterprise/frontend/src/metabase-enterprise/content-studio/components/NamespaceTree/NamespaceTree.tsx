import { useCallback, useMemo } from "react";

import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { ContentStudioSection } from "metabase/content-studio/app/pages/ContentStudioLayout";

import { getSectionIcon, getSectionTitle } from "../../content-target";
import {
  ContentStudioTreeNode,
  type ContentStudioTreeNodeItem,
} from "../ContentStudioTreeNode";

import { NamespaceRootMenu } from "./NamespaceRootMenu";

const ROOT_NODE_ID = "namespace-root";

export type ContentStudioNamespaceSection = Extract<
  ContentStudioSection,
  "transforms" | "snippets"
>;

type NamespaceTreeProps = {
  section: ContentStudioNamespaceSection;
  /** The namespace root's own view. */
  url: string;
  folders: ContentStudioTreeNodeItem[];
  isRootSelected: boolean;
  selectedFolderId: string | undefined;
};

/** A namespace root as a tree row, expanding to that namespace's folders. */
export function NamespaceTree({
  section,
  url,
  folders,
  isRootSelected,
  selectedFolderId,
}: NamespaceTreeProps) {
  const name = getSectionTitle(section);

  const nodes = useMemo<ContentStudioTreeNodeItem[]>(
    () => [
      {
        id: ROOT_NODE_ID,
        name,
        icon: getSectionIcon(section),
        url,
        children: folders,
      },
    ],
    [name, section, url, folders],
  );

  const renderRootMenu = useCallback(
    (item: ITreeNodeItem) =>
      item.id === ROOT_NODE_ID ? (
        <NamespaceRootMenu section={section} label={name} />
      ) : null,
    [name, section],
  );

  return (
    <Tree
      data={nodes}
      selectedId={isRootSelected ? ROOT_NODE_ID : selectedFolderId}
      TreeNode={ContentStudioTreeNode}
      role="tree"
      aria-label={name}
      rightSection={renderRootMenu}
    />
  );
}
