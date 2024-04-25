import { t } from "ttag";

import CollectionPermissionsModal from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { canonicalCollectionId } from "metabase/collections/utils";
import Modal from "metabase/components/Modal";
import {
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS,
  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
  PLUGIN_SNIPPET_SIDEBAR_MODALS,
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import CollectionOptionsButton from "./components/CollectionOptionsButton";
import CollectionRow from "./components/CollectionRow";
import SnippetCollectionFormModal from "./components/SnippetCollectionFormModal";

if (hasPremiumFeature("snippet_collections")) {
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.push(snippetSidebar => ({
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

  PLUGIN_SNIPPET_SIDEBAR_MODALS.push(
    snippetSidebar =>
      snippetSidebar.state.modalSnippetCollection && (
        <Modal
          onClose={() =>
            snippetSidebar.setState({ modalSnippetCollection: null })
          }
        >
          <SnippetCollectionFormModal
            collection={snippetSidebar.state.modalSnippetCollection}
            onClose={() =>
              snippetSidebar.setState({ modalSnippetCollection: null })
            }
            onSaved={() => {
              snippetSidebar.setState({ modalSnippetCollection: null });
            }}
          />
        </Modal>
      ),
    snippetSidebar =>
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

  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS.collection = CollectionRow;

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
