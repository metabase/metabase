import { t } from "ttag";

import { CollectionRowMenu } from "metabase/collections/components/CollectionRowMenu";
import { canonicalCollectionId } from "metabase/collections/utils";
import {
  PLUGIN_SNIPPET_FOLDERS,
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS,
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS,
  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
} from "metabase/plugins";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import CollectionRow from "./components/CollectionRow";
import { MoveSnippetModal } from "./components/MoveSnippetModal";
import { SnippetCollectionPermissionsModal } from "./components/SnippetCollectionPermissionsModal";
import { SnippetCollectionPickerModal } from "./components/SnippetCollectionPickerModal";

/**
 * Initialize snippets plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("snippet_collections")) {
    // Add new menu option
    PLUGIN_SNIPPET_FOLDERS.isEnabled = true;
    PLUGIN_SNIPPET_FOLDERS.CollectionPickerModal = SnippetCollectionPickerModal;
    PLUGIN_SNIPPET_FOLDERS.CollectionPermissionsModal =
      SnippetCollectionPermissionsModal;
    PLUGIN_SNIPPET_FOLDERS.MoveSnippetModal = MoveSnippetModal;
    PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.push((snippetSidebar) => ({
      icon: "folder",
      name: t`New folder`,
      onClick: () => {
        snippetSidebar.props.dispatch(
          setOpenModalWithProps({
            id: "collection",
            props: {
              initialCollectionId: canonicalCollectionId(
                snippetSidebar.props.snippetCollection.id,
              ),
              namespaces: ["snippets"],
              pickerOptions: SNIPPET_COLLECTION_PICKER_OPTIONS,
              showAuthorityLevelPicker: false,
              shouldNavigateOnCreate: false,
            },
          }),
        );
      },
    }));

    // Set collection row renderer
    PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS.collection = CollectionRow;

    // Add header button
    PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS.push((snippetSidebar) => {
      const collection = snippetSidebar.props.snippetCollection;
      return (
        <CollectionRowMenu
          key="snippet-collection-row-menu"
          collection={collection}
        />
      );
    });
  }
}

/**
 * Reset snippets plugin features.
 *
 * @internal for testing purposes only
 */
export function resetPlugin() {
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.length = 0;
  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS.collection = null;
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS.length = 0;
}

const SNIPPET_COLLECTION_PICKER_OPTIONS = {
  hasLibrary: false,
  hasRootCollection: true,
  hasPersonalCollections: false,
  hasRecents: false,
  hasSearch: false,
  hasConfirmButtons: true,
  canCreateCollections: false,
};
