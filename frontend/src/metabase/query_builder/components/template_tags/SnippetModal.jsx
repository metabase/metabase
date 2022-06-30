/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Modal from "metabase/components/Modal";
import Link from "metabase/core/components/Link";
import Snippets from "metabase/entities/snippets";
import SnippetCollections from "metabase/entities/snippet-collections";

class SnippetModal extends React.Component {
  render() {
    const {
      insertSnippet,
      onSnippetUpdate,
      closeModal,
      snippet,
      snippetCollections,
    } = this.props;

    return (
      <Modal onClose={closeModal}>
        <Snippets.ModalForm
          snippet={snippet}
          form={
            snippetCollections.length <= 1
              ? Snippets.forms.withoutVisibleCollectionPicker
              : Snippets.forms.withVisibleCollectionPicker
          }
          title={
            snippet.id != null
              ? t`Editing ${snippet.name}`
              : t`Create your new snippet`
          }
          onSaved={savedSnippet => {
            if (snippet.id == null) {
              insertSnippet(savedSnippet);
            } else {
              // this will update the query if the name changed
              onSnippetUpdate(savedSnippet, snippet);
            }
            closeModal();
          }}
          onClose={closeModal} // the "x" button
          submitTitle={t`Save`}
          footerExtraButtons={
            // only display archive for saved snippets
            snippet.id != null ? (
              <Link
                onClick={async () => {
                  await snippet.update({ archived: true });
                  closeModal();
                }}
                className="flex align-center text-medium text-bold"
              >
                <Icon name="archive" className="mr1" />
                {t`Archive`}
              </Link>
            ) : null
          }
        />
      </Modal>
    );
  }
}

export default SnippetCollections.loadList()(SnippetModal);
