/* @flow weak */

import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import cx from "classnames";

import Icon from "metabase/components/Icon";

import TagEditorParam from "./TagEditorParam";
import CardTagEditor from "./CardTagEditor";
import TagEditorHelp from "./TagEditorHelp";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import Snippets from "metabase/entities/snippets";

import MetabaseAnalytics from "metabase/lib/analytics";

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import type { DatasetQuery } from "metabase/meta/types/Card";
import type { TableId } from "metabase/meta/types/Table";
import type { Database } from "metabase/meta/types/Database";
import type { TemplateTag } from "metabase/meta/types/Query";
import type { Field as FieldObject } from "metabase/meta/types/Field";

type Props = {
  query: NativeQuery,
  setDatasetQuery: (datasetQuery: DatasetQuery) => void,
  onClose: () => void,
};

@Snippets.loadList()
export default class SnippetSidebar extends React.Component {
  props: Props;

  static propTypes = {
    card: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    setDatasetQuery: PropTypes.func.isRequired,
  };

  render() {
    console.log("render sidebar", this.props);
    const { setDatasetQuery, query, onClose, snippets } = this.props;

    return (
      <SidebarContent title={t`Snippets`} onClose={onClose}>
        <div className="px3">
          <h3>{t`Snippets are reusable bits of SQL`}</h3>
          <a className="block my3 text-brand" onClick={() => alert("modal!")}>
            <Icon name={"add"} size={12} className="mr1" />
            {t`Add a snippet`}
          </a>
          {snippets.map(({ name, description }) => (
            <div className="rounded bg-medium flex p2">
              <Icon name={"snippet"} size={16} className="mr1" />
              <span className="flex-full">{name}</span>
              <Icon name={"pencil"} size={16} />
            </div>
          ))}
        </div>
      </SidebarContent>
    );
  }
}
