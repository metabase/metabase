/* @flow weak */

import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";

import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Modal from "metabase/components/Modal";
import Tooltip from "metabase/components/Tooltip";
import Link from "metabase/components/Link";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

import Snippets from "metabase/entities/snippets";

import type { DatasetQuery } from "metabase/meta/types/Card";
import type { Snippet } from "metabase/meta/types/Snippet";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

type Props = {
  query: NativeQuery,
  setDatasetQuery: (datasetQuery: DatasetQuery) => void,
  onClose: () => void,
  nativeEditorCursorOffset: number,
  nativeEditorSelectedText: string,
  snippets: Snippet[],
};

type State = { modalSnippet: ?Snippet };

const ICON_SIZE = 16;

@Snippets.loadList({ wrapped: true })
export default class SnippetSidebar extends React.Component {
  props: Props;
  state: State = { modalSnippet: null };

  static propTypes = {
    query: PropTypes.object.isRequired,
    setDatasetQuery: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    nativeEditorCursorOffset: PropTypes.number.isRequired,
    nativeEditorSelectedText: PropTypes.string.isRequired,
  };

  render() {
    const { query, onClose, snippets } = this.props;

    return (
      <SidebarContent title={t`Snippets`} onClose={onClose}>
        <div className="px3">
          <h3>{t`Snippets are reusable bits of SQL`}</h3>

          {query.databaseId() == null ? (
            <p className="text-body text-centered">{t`Select a database to see its snippets.`}</p>
          ) : (
            <div>
              <a
                className="block my3 text-brand"
                onClick={this.openCreateModal}
              >
                <Icon name={"add"} size={12} className="mr1" />
                {t`Add a snippet`}
              </a>
              {snippets
                .filter(snippet => query.databaseId() === snippet.database_id)
                .map(this.renderSnippet)}
            </div>
          )}
        </div>
        {this.renderModal()}
      </SidebarContent>
    );
  }

  renderSnippet = snippet => (
    <Tooltip key={snippet.id} tooltip={snippet.description}>
      <div className="bg-medium-hover hover-parent hover--display flex p2 rounded">
        <a
          onClick={() => this.insertSnippet(snippet)}
          style={{ height: ICON_SIZE }} // without setting this <a> adds more height around the icon
        >
          <Icon name={"snippet"} size={ICON_SIZE} className="mr1" />
        </a>
        <span className="flex-full">{snippet.name}</span>
        <a
          className="hover-child"
          onClick={() => this.setState({ modalSnippet: snippet })}
          style={{ height: ICON_SIZE }}
        >
          <Icon name={"pencil"} size={ICON_SIZE} />
        </a>
      </div>
    </Tooltip>
  );

  insertSnippet({ name }) {
    const {
      query,
      setDatasetQuery,
      nativeEditorCursorOffset,
      nativeEditorSelectedText,
    } = this.props;
    const newText =
      query
        .queryText()
        .slice(0, nativeEditorCursorOffset - nativeEditorSelectedText.length) +
      `{{snippet: ${name}}}` +
      query.queryText().slice(nativeEditorCursorOffset);
    setDatasetQuery(query.setQueryText(newText).datasetQuery());
  }

  renderModal() {
    const snippet = this.state.modalSnippet;
    if (snippet == null) {
      return null;
    }
    const closeModal = () => this.setState({ modalSnippet: null });

    return (
      <Modal>
        {Snippets.ModalForm({
          snippet,
          title:
            snippet.id != null
              ? t`Editing ${snippet.name}`
              : t`Create your new snippet`,
          onSaved: closeModal,
          onClose: closeModal, // the "x" button
          onCancel: closeModal, // the cancel button
          submitTitle: t`Save`,
          footerLeftButtons:
            // only display archive for saved snippets
            snippet.id != null ? (
              <Link
                style={{ color: colors.error }}
                onClick={async () => {
                  // $FlowFixMe
                  await snippet.update({ archived: true });
                  closeModal();
                }}
              >{t`Archive`}</Link>
            ) : null,
        })}
      </Modal>
    );
  }

  openCreateModal = () =>
    this.setState({
      modalSnippet: {
        database_id: this.props.query.databaseId(),
        content: this.props.nativeEditorSelectedText,
      },
    });
}
