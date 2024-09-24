import { PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS } from "metabase/plugins";
import type {
  Collection,
  CollectionId,
  NativeQuerySnippet,
  User,
} from "metabase-types/api";

import { SnippetRow } from "./SnippetRow";

type SnippetSidebarRowProps = {
  canWrite: boolean;
  setSnippetCollectionId: (id: CollectionId) => void;
  user: User;
  className?: string;
  insertSnippet?: (snippet: NativeQuerySnippet) => void;
  setModalSnippet?: (snippet: NativeQuerySnippet) => void;
  permissionsModalCollectionId?: CollectionId | null;
  setPermissionsModalCollectionId?: (c: CollectionId | null) => void;
  modalSnippetCollection?: Collection | null;
  setModalSnippetCollection?: (c: Collection | null) => void;
} & (CollectionSnippetRowComponent | SnippetRowComponent);

type CollectionSnippetRowComponent = {
  item: Collection;
  type: "collection";
};

type SnippetRowComponent = {
  item: NativeQuerySnippet;
  type: "snippet";
};

export const SnippetSidebarRow = ({
  type,
  ...props
}: SnippetSidebarRowProps) => {
  const Component = {
    snippet: SnippetRow,
    ...PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
  }[type];
  return Component ? <Component {...props} /> : null;
};
