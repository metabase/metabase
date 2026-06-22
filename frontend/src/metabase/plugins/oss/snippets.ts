import type { ComponentType } from "react";

import type { Dispatch } from "metabase/redux/store";
import type {
  Collection,
  CollectionId,
  IconName,
  NativeQuerySnippet,
} from "metabase-types/api";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

export type SnippetSidebarMenuOption = {
  icon: IconName;
  name: string;
  onClick: () => void;
};

// EE plugins receive the SnippetSidebar class instance; this is the subset of
// its props they rely on.
export type SnippetSidebarContext = {
  props: {
    snippetCollection: Collection;
    dispatch: Dispatch;
  };
};

export type SnippetSidebarRowRenderers = {
  collection: ComponentType<{
    item: Collection;
    setSnippetCollectionId?: (id: CollectionId) => void;
  }> | null;
};

export type SnippetCollectionPickerModalProps = {
  isOpen: boolean;
  onSelect: (collectionId: CollectionId | null) => void;
  onClose: () => void;
};

export type SnippetCollectionPermissionsModalProps = {
  opened: boolean;
  collectionId: CollectionId;
  onClose: () => void;
};

export type MoveSnippetModalProps = {
  snippet: NativeQuerySnippet;
  onClose: () => void;
};

export type SnippetFoldersPlugin = {
  isEnabled: boolean;
  CollectionPickerModal: ComponentType<SnippetCollectionPickerModalProps>;
  CollectionPermissionsModal: ComponentType<SnippetCollectionPermissionsModalProps>;
  MoveSnippetModal: ComponentType<MoveSnippetModalProps>;
};

export const getDefaultPluginSnippetFolders = () => ({
  isEnabled: false,
  CollectionPickerModal:
    PluginPlaceholder as ComponentType<SnippetCollectionPickerModalProps>,
  CollectionPermissionsModal:
    PluginPlaceholder as ComponentType<SnippetCollectionPermissionsModalProps>,
  MoveSnippetModal: PluginPlaceholder as ComponentType<MoveSnippetModalProps>,
});

export const PLUGIN_SNIPPET_FOLDERS = getDefaultPluginSnippetFolders();

export function reinitialize() {
  Object.assign(PLUGIN_SNIPPET_FOLDERS, getDefaultPluginSnippetFolders());
}
