import type { Component, ComponentType } from "react";

import type { IconName } from "metabase/ui";
import type {
  Collection,
  CollectionId,
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
  modalSnippetCollection?: Partial<Collection> | null;
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

export type SnippetFormModalProps = {
  collection: Partial<Collection>;
  onClose: () => void;
  onSaved?: () => void;
  opened?: boolean;
};

export type SnippetCollectionMenuProps = {
  collection: Collection;
  onEditDetails: (collection: Collection) => void;
  onChangePermissions: (collectionId: CollectionId) => void;
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
  CollectionFormModal: ComponentType<SnippetFormModalProps>;
  CollectionMenu: ComponentType<SnippetCollectionMenuProps>;
  CollectionPermissionsModal: ComponentType<SnippetCollectionPermissionsModalProps>;
  MoveSnippetModal: ComponentType<MoveSnippetModalProps>;
};

export const getDefaultPluginSnippetFolders = () => ({
  isEnabled: false,
  CollectionPickerModal:
    PluginPlaceholder as ComponentType<SnippetCollectionPickerModalProps>,
  CollectionFormModal:
    PluginPlaceholder as ComponentType<SnippetFormModalProps>,
  CollectionMenu:
    PluginPlaceholder as ComponentType<SnippetCollectionMenuProps>,
  CollectionPermissionsModal:
    PluginPlaceholder as ComponentType<SnippetCollectionPermissionsModalProps>,
  MoveSnippetModal: PluginPlaceholder as ComponentType<MoveSnippetModalProps>,
});

export const PLUGIN_SNIPPET_FOLDERS = getDefaultPluginSnippetFolders();

export function reinitialize() {
  Object.assign(PLUGIN_SNIPPET_FOLDERS, getDefaultPluginSnippetFolders());
}
