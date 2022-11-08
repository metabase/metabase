/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Modal from "metabase/components/Modal";

import SnippetCollections from "metabase/entities/snippet-collections";

class SnippetCollectionModal extends React.Component {
  render() {
    const {
      snippetCollection,
      collection: passedCollection,
      onClose,
      onSaved,
    } = this.props;
    const collection = snippetCollection || passedCollection;
    return (
      <Modal onClose={onClose}>
        <SnippetCollections.ModalForm
          title={
            collection.id == null
              ? t`Create your new folder`
              : t`Editing ${collection.name}`
          }
          snippetCollection={collection}
          onClose={onClose}
          onSaved={onSaved}
        />
      </Modal>
    );
  }
}

export default SnippetCollections.load({
  id: (state, props) => props.collection.id,
})(SnippetCollectionModal);
