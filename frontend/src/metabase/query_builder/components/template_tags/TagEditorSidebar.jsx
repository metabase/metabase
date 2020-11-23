/* @flow weak */

import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import cx from "classnames";

import TagEditorParam from "./TagEditorParam";
import CardTagEditor from "./CardTagEditor";
import TagEditorHelp from "./TagEditorHelp";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

import MetabaseAnalytics from "metabase/lib/analytics";

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import type { DatasetQuery } from "metabase-types/types/Card";
import type { TableId } from "metabase-types/types/Table";
import type { Database } from "metabase-types/types/Database";
import type { TemplateTag } from "metabase-types/types/Query";
import type { Field as FieldObject } from "metabase-types/types/Field";

type Props = {
  query: NativeQuery,

  setDatasetQuery: (datasetQuery: DatasetQuery) => void,
  updateTemplateTag: (tag: TemplateTag) => void,

  databaseFields: FieldObject[],
  databases: Database[],
  sampleDatasetId: TableId,

  onClose: () => void,
};
type State = {
  section: "help" | "settings",
};

export default class TagEditorSidebar extends React.Component {
  props: Props;
  state: State = {
    section: "settings",
  };

  static propTypes = {
    card: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    updateTemplateTag: PropTypes.func.isRequired,
    databaseFields: PropTypes.array,
    setDatasetQuery: PropTypes.func.isRequired,
    sampleDatasetId: PropTypes.number,
  };

  setSection(section) {
    this.setState({ section: section });
    MetabaseAnalytics.trackEvent(
      "QueryBuilder",
      "Template Tag Editor Section Change",
      section,
    );
  }

  render() {
    const {
      databases,
      databaseFields,
      sampleDatasetId,
      setDatasetQuery,
      query,
      updateTemplateTag,
      onClose,
    } = this.props;
    // The tag editor sidebar excludes snippets since they have a separate sidebar.
    const tags = query.templateTagsWithoutSnippets();
    const database = query.database();

    let section;
    if (tags.length === 0) {
      section = "help";
    } else {
      section = this.state.section;
    }

    return (
      <SidebarContent title={t`Variables`} onClose={onClose}>
        <div>
          <div className="mx3 text-centered Button-group Button-group--brand text-uppercase mb2 flex flex-full">
            <a
              className={cx("Button flex-full Button--small", {
                "Button--active": section === "settings",
                disabled: tags.length === 0,
              })}
              onClick={() => this.setSection("settings")}
            >{t`Settings`}</a>
            <a
              className={cx("Button flex-full Button--small", {
                "Button--active": section === "help",
              })}
              onClick={() => this.setSection("help")}
            >{t`Help`}</a>
          </div>
          {section === "settings" ? (
            <SettingsPane
              tags={tags}
              onUpdate={updateTemplateTag}
              databaseFields={databaseFields}
              database={database}
              databases={databases}
              query={query}
              setDatasetQuery={setDatasetQuery}
            />
          ) : (
            <TagEditorHelp
              database={database}
              sampleDatasetId={sampleDatasetId}
              setDatasetQuery={setDatasetQuery}
              switchToSettings={() => this.setSection("settings")}
            />
          )}
        </div>
      </SidebarContent>
    );
  }
}

const SettingsPane = ({
  tags,
  onUpdate,
  databaseFields,
  database,
  databases,
  query,
  setDatasetQuery,
}) => (
  <div>
    {tags.map(tag => (
      <div key={tags.name}>
        {tag.type === "card" ? (
          <CardTagEditor
            query={query}
            setDatasetQuery={setDatasetQuery}
            tag={tag}
          />
        ) : (
          <TagEditorParam
            tag={tag}
            onUpdate={onUpdate}
            databaseFields={databaseFields}
            database={database}
            databases={databases}
          />
        )}
      </div>
    ))}
  </div>
);

SettingsPane.propTypes = {
  tags: PropTypes.object.isRequired,
  onUpdate: PropTypes.func.isRequired,
  setDatasetQuery: PropTypes.func.isRequired,
  query: NativeQuery,
  databaseFields: PropTypes.array,
};
