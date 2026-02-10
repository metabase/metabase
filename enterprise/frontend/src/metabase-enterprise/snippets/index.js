import { t } from "ttag";

import CollectionPermissionsModal from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { canonicalCollectionId } from "metabase/collections/utils";
import { Modal } from "metabase/common/components/Modal";
import {
  PLUGIN_SNIPPET_FOLDERS,
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS,
  PLUGIN_SNIPPET_SIDEBAR_MODALS,
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS,
  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import CollectionOptionsButton from "./components/CollectionOptionsButton";
import CollectionRow from "./components/CollectionRow";
import { MoveSnippetModal } from "./components/MoveSnippetModal";
import SnippetCollectionFormModal from "./components/SnippetCollectionFormModal";
import { SnippetCollectionMenu } from "./components/SnippetCollectionMenu";
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
    PLUGIN_SNIPPET_FOLDERS.CollectionFormModal = SnippetCollectionFormModal;
    PLUGIN_SNIPPET_FOLDERS.CollectionMenu = SnippetCollectionMenu;
    PLUGIN_SNIPPET_FOLDERS.CollectionPermissionsModal =
      SnippetCollectionPermissionsModal;
    PLUGIN_SNIPPET_FOLDERS.MoveSnippetModal = MoveSnippetModal;
    PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.push((snippetSidebar) => ({
      icon: "folder",
      name: t`New folder`,
      onClick: () =>
        snippetSidebar.setState({
          modalSnippetCollection: {
            parent_id: canonicalCollectionId(
              snippetSidebar.props.snippetCollection.id,
            ),
          },
        }),
    }));

    // Add modals
    PLUGIN_SNIPPET_SIDEBAR_MODALS.push(
      (snippetSidebar) =>
        snippetSidebar.state.modalSnippetCollection && (
          <SnippetCollectionFormModal
            collection={snippetSidebar.state.modalSnippetCollection}
            onClose={() =>
              snippetSidebar.setState({ modalSnippetCollection: null })
            }
            onSaved={() => {
              snippetSidebar.setState({ modalSnippetCollection: null });
            }}
          />
        ),
      (snippetSidebar) =>
        snippetSidebar.state.permissionsModalCollectionId != null && (
          <Modal
            onClose={() =>
              snippetSidebar.setState({ permissionsModalCollectionId: null })
            }
          >
            <CollectionPermissionsModal
              params={{
                slug: snippetSidebar.state.permissionsModalCollectionId,
              }}
              onClose={() =>
                snippetSidebar.setState({ permissionsModalCollectionId: null })
              }
              namespace="snippets"
            />
          </Modal>
        ),
    );

    // Set collection row renderer
    PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS.collection = CollectionRow;

    // Add header button
    PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS.push((snippetSidebar, props) => {
      const collection = snippetSidebar.props.snippetCollection;
      return (
        <CollectionOptionsButton
          {...snippetSidebar.props}
          {...props}
          setSidebarState={snippetSidebar.setState.bind(snippetSidebar)}
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
  PLUGIN_SNIPPET_SIDEBAR_MODALS.length = 0;
  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS.collection = null;
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS.length = 0;
}
