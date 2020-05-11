/* @flow weak */

import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

import Snippets from "metabase/entities/snippets";

import type { Snippet } from "metabase/meta/types/Snippet";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

type Props = {
  query: NativeQuery,
  onClose: () => void,
  setModalSnippet: () => void,
  openSnippetModalWithSelectedText: () => void,
  insertSnippet: () => void,
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
    onClose: PropTypes.func.isRequired,
    setModalSnippet: PropTypes.func.isRequired,
    openSnippetModalWithSelectedText: PropTypes.func.isRequired,
    insertSnippet: PropTypes.func.isRequired,
  };

  render() {
    const {
      query,
      onClose,
      openSnippetModalWithSelectedText,
      snippets,
    } = this.props;

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
                onClick={openSnippetModalWithSelectedText}
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
      </SidebarContent>
    );
  }

  renderSnippet = snippet => (
    <Tooltip key={snippet.id} tooltip={snippet.description}>
      <div className="bg-medium-hover hover-parent hover--display flex p2 rounded">
        <a
          onClick={() => this.props.insertSnippet(snippet)}
          style={{ height: ICON_SIZE }} // without setting this <a> adds more height around the icon
        >
          <Icon name={"snippet"} size={ICON_SIZE} className="mr1" />
        </a>
        <span className="flex-full">{snippet.name}</span>
        <a
          className="hover-child"
          onClick={() => this.props.setModalSnippet(snippet)}
          style={{ height: ICON_SIZE }}
        >
          <Icon name={"pencil"} size={ICON_SIZE} />
        </a>
      </div>
    </Tooltip>
  );
}
