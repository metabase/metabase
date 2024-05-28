import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import type { EmbeddingParameterVisibility } from "metabase/public/lib/types";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type Field from "metabase-lib/v1/metadata/Field";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Card,
  DatabaseId,
  NativeDatasetQuery,
  Parameter,
  ParameterId,
  RowValue,
  TemplateTag,
  TemplateTagId,
} from "metabase-types/api";

import { TagEditorHelp } from "./TagEditorHelp";
import { TagEditorParam } from "./TagEditorParam";

type GetEmbeddedParamVisibility = (
  slug: string,
) => EmbeddingParameterVisibility;

interface TagEditorSidebarProps {
  card: Card;
  query: NativeQuery;
  databases: Database[];
  databaseFields: Field[];
  question: Question;
  sampleDatabaseId: DatabaseId;
  setDatasetQuery: (query: NativeDatasetQuery) => void;
  setTemplateTag: (tag: TemplateTag) => void;
  setTemplateTagConfig: (tag: TemplateTag, config: Parameter) => void;
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
  onClose: () => void;
  getEmbeddedParameterVisibility: GetEmbeddedParamVisibility;
}

interface TagEditorSidebarState {
  section: "settings" | "help";
}

export class TagEditorSidebar extends Component<TagEditorSidebarProps> {
  state: TagEditorSidebarState = {
    section: "settings",
  };

  setSection(section: "settings" | "help") {
    this.setState({ section });
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
      question,
      setTemplateTag,
      setTemplateTagConfig,
      setParameterValue,
      onClose,
      getEmbeddedParameterVisibility,
    } = this.props;
    const tags = query.variableTemplateTags();
    const database = question.database();
    const parameters = question.parameters();
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
          <div
            className={cx(
              CS.mx3,
              CS.textCentered,
              ButtonsS.ButtonGroup,
              ButtonsS.ButtonGroupBrand,
              CS.textUppercase,
              CS.mb2,
              CS.flex,
              CS.flexFull,
            )}
          >
            <a
              className={cx(
                ButtonsS.Button,
                CS.flexFull,
                ButtonsS.ButtonSmall,
                {
                  [ButtonsS.ButtonActive]: section === "settings",
                  [CS.disabled]: tags.length === 0,
                },
              )}
              onClick={() => this.setSection("settings")}
            >{t`Settings`}</a>
            <a
              className={cx(
                ButtonsS.Button,
                CS.flexFull,
                ButtonsS.ButtonSmall,
                {
                  [ButtonsS.ButtonActive]: section === "help",
                },
              )}
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
              getEmbeddedParameterVisibility={getEmbeddedParameterVisibility}
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

interface SettingsPaneProps {
  tags: TemplateTag[];
  database?: Database | null;
  databases: Database[];
  databaseFields: Field[];
  parametersById: Record<ParameterId, Parameter>;
  setTemplateTag: (tag: TemplateTag) => void;
  setTemplateTagConfig: (tag: TemplateTag, config: Parameter) => void;
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
  getEmbeddedParameterVisibility: GetEmbeddedParamVisibility;
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
  getEmbeddedParameterVisibility,
}: SettingsPaneProps) => (
  <div>
    {tags.map(tag => (
      <div key={tag.id}>
        <TagEditorParam
          tag={tag}
          key={tag.name}
          parameter={parametersById[tag.id]}
          embeddedParameterVisibility={
            parametersById[tag.id]
              ? getEmbeddedParameterVisibility(parametersById[tag.id].slug)
              : null
          }
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
