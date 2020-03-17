/* @flow weak */

import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Modal from "metabase/components/Modal";
import Tooltip from "metabase/components/Tooltip";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

import Snippets from "metabase/entities/snippets";

import type { DatasetQuery } from "metabase/meta/types/Card";

type Props = {
  query: NativeQuery,
  setDatasetQuery: (datasetQuery: DatasetQuery) => void,
  onClose: () => void,
};

const ICON_SIZE = 16;

@Snippets.loadList()
export default class SnippetSidebar extends React.Component {
  props: Props;

  static propTypes = {
    card: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    setDatasetQuery: PropTypes.func.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = { editingSnippet: null, showCreateModal: false };
  }

  insertSnippet({ name }) {
    const { query, setDatasetQuery } = this.props;
    const newText = query.queryText() + `{{ snippet: ${name} }}`;
    setDatasetQuery(query.setQueryText(newText).datasetQuery());
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
          onClick={() => this.setState({ editingSnippet: snippet })}
          style={{ height: ICON_SIZE }}
        >
          <Icon name={"pencil"} size={ICON_SIZE} />
        </a>
      </div>
    </Tooltip>
  );

  render() {
    const { setDatasetQuery, query, onClose, snippets } = this.props;
    const { editingSnippet, showCreateModal } = this.state;

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
                onClick={() => this.setState({ showCreateModal: true })}
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
        {(showCreateModal || editingSnippet != null) && (
          <Modal>
            {Snippets.ModalForm({
              snippet: editingSnippet || { database_id: query.databaseId() },
              onClose: () =>
                this.setState({ editingSnippet: null, showCreateModal: false }),
            })}
          </Modal>
        )}
      </SidebarContent>
    );
  }
}
