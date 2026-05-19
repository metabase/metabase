import type { Component, ComponentType } from "react";

import type {
  CollectionId,
  IconName,
  NativeQuerySnippet,
} from "metabase-types/api";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

export type SnippetSidebarMenuOption = {
  icon: IconName;
  name?: string;
  label?: string;
  onClick: () => void;
};

export type SnippetSidebarState = {
  permissionsModalCollectionId?: CollectionId | null;
};

export type SnippetSidebarProps = {
  snippetCollection: { id: CollectionId | null };
};

export type SnippetSidebarComponent = Component<
  SnippetSidebarProps,
  SnippetSidebarState
>;

export type SnippetCollectionPickerModalProps = {
  isOpen: boolean;
  onSelect: (collectionId: CollectionId | null) => void;
  onClose: () => void;
};

export type SnippetCollectionPermissionsModalProps = {
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
