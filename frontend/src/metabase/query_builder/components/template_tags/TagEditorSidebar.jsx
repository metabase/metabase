/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";

import SidebarContent from "metabase/query_builder/components/SidebarContent";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import TagEditorParam from "./TagEditorParam";
import TagEditorHelp from "./TagEditorHelp";

export default class TagEditorSidebar extends React.Component {
  state = {
    section: "settings",
  };

  static propTypes = {
    card: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    databaseFields: PropTypes.array,
    sampleDatabaseId: PropTypes.number,
    setDatasetQuery: PropTypes.func.isRequired,
    setTemplateTag: PropTypes.func.isRequired,
    setTemplateTagConfig: PropTypes.func.isRequired,
    setParameterValue: PropTypes.func.isRequired,
  };

  setSection(section) {
    this.setState({ section: section });
    MetabaseAnalytics.trackStructEvent(
      "QueryBuilder",
      "Template Tag Editor Section Change",
      section,
    );
  }

  render() {
    const {
      databases,
      databaseFields,
      sampleDatabaseId,
      setDatasetQuery,
      query,
      setTemplateTag,
      setTemplateTagConfig,
      setParameterValue,
      onClose,
    } = this.props;
    const tags = query.variableTemplateTags();
    const database = query.database();
    const parameters = query.question().parameters();
    const parametersById = _.indexBy(parameters, "id");

    let section;
    if (tags.length === 0) {
      section = "help";
    } else {
      section = this.state.section;
    }

    return (
      <SidebarContent title={t`Variables`} onClose={onClose}>
        <div data-testid="tag-editor-sidebar">
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
              parametersById={parametersById}
              databaseFields={databaseFields}
              database={database}
              databases={databases}
              setTemplateTag={setTemplateTag}
              setTemplateTagConfig={setTemplateTagConfig}
              setParameterValue={setParameterValue}
            />
          ) : (
            <TagEditorHelp
              database={database}
              sampleDatabaseId={sampleDatabaseId}
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
  parametersById,
  databaseFields,
  database,
  databases,
  setTemplateTag,
  setTemplateTagConfig,
  setParameterValue,
}) => (
  <div>
    {tags.map(tag => (
      <div key={tags.name}>
        <TagEditorParam
          tag={tag}
          key={tags.name}
          parameter={parametersById[tag.id]}
          databaseFields={databaseFields}
          database={database}
          databases={databases}
          setTemplateTag={setTemplateTag}
          setTemplateTagConfig={setTemplateTagConfig}
          setParameterValue={setParameterValue}
        />
      </div>
    ))}
  </div>
);

SettingsPane.propTypes = {
  tags: PropTypes.array.isRequired,
  query: NativeQuery,
  databaseFields: PropTypes.array,
  setDatasetQuery: PropTypes.func.isRequired,
  setTemplateTag: PropTypes.func.isRequired,
  setParameterValue: PropTypes.func.isRequired,
};
