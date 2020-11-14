import React from "react";
import { t } from "ttag";

import {
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS,
  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
  PLUGIN_SNIPPET_SIDEBAR_MODALS,
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS,
} from "metabase/plugins";

import MetabaseSettings from "metabase/lib/settings";
import CollectionPermissionsModal from "metabase/admin/permissions/containers/CollectionPermissionsModal";
import Modal from "metabase/components/Modal";

import CollectionRow from "./components/CollectionRow";
import SnippetCollectionModal from "./components/SnippetCollectionModal";
import CollectionOptionsButton from "./components/CollectionOptionsButton";

if (MetabaseSettings.enhancementsEnabled()) {
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.push(snippetSidebar => ({
    icon: "folder",
    name: t`New folder`,
    onClick: () =>
      snippetSidebar.setState({
        modalSnippetCollection: {
          parent_id: snippetSidebar.props.snippetCollection.id,
        },
      }),
  }));
}

PLUGIN_SNIPPET_SIDEBAR_MODALS.push(
  snippetSidebar =>
    snippetSidebar.state.modalSnippetCollection && (
      <SnippetCollectionModal
        collection={snippetSidebar.state.modalSnippetCollection}
        onClose={() =>
          snippetSidebar.setState({ modalSnippetCollection: null })
        }
        onSaved={() => {
          snippetSidebar.setState({ modalSnippetCollection: null });
        }}
      />
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
            collectionId: snippetSidebar.state.permissionsModalCollectionId,
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
