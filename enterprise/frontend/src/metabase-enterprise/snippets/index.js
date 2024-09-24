/* eslint-disable react/display-name */
import { useState } from "react";
import { t } from "ttag";

import CollectionPermissionsModal from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { canonicalCollectionId } from "metabase/collections/utils";
import Modal from "metabase/components/Modal";
import {
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS,
  PLUGIN_SNIPPET_SIDEBAR_MODALS,
  PLUGIN_SNIPPET_SIDEBAR_MODALS_CONTROLS,
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS,
  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CollectionOptionsButton } from "./components/CollectionOptionsButton";
import { CollectionRow } from "./components/CollectionRow";
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

  PLUGIN_SNIPPET_SIDEBAR_MODALS_CONTROLS.useControls = () => {
    const [modalSnippetCollection, setModalSnippetCollection] = useState(null);
    const [permissionsModalCollectionId, setPermissionsModalCollectionId] =
      useState(null);

    return {
      modalSnippetCollection,
      setModalSnippetCollection,
      permissionsModalCollectionId,
      setPermissionsModalCollectionId,
    };
  };

  PLUGIN_SNIPPET_SIDEBAR_MODALS.MODAL_SNIPPET_COLLECTION = ({
    modalSnippetCollection,
    setModalSnippetCollection,
  }) =>
    modalSnippetCollection && (
      <Modal onClose={() => setModalSnippetCollection(null)}>
        <SnippetCollectionFormModal
          collection={modalSnippetCollection}
          onClose={() => setModalSnippetCollection(null)}
          onSaved={() => {
            setModalSnippetCollection(null);
          }}
        />
      </Modal>
    );

  PLUGIN_SNIPPET_SIDEBAR_MODALS.PERMISSIONS_MODAL_COLLECTION_ID = ({
    permissionsModalCollectionId,
    setPermissionsModalCollectionId,
  }) =>
    permissionsModalCollectionId != null && (
      <Modal onClose={() => setPermissionsModalCollectionId(null)}>
        <CollectionPermissionsModal
          params={{
            slug: permissionsModalCollectionId,
          }}
          onClose={() => setPermissionsModalCollectionId(null)}
          namespace="snippets"
        />
      </Modal>
    );

  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS.collection = CollectionRow;

  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS.push(
    ({
      snippetCollection,
      setPermissionsModalCollectionId,
      setModalSnippetCollection,
      user,
      className,
    }) => {
      const collection = snippetCollection;
      return (
        <CollectionOptionsButton
          setPermissionsModalCollectionId={setPermissionsModalCollectionId}
          setModalSnippetCollection={setModalSnippetCollection}
          user={user}
          className={className}
          collection={collection}
        />
      );
    },
  );
}
