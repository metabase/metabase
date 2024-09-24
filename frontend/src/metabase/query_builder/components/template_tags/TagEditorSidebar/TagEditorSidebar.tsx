import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
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
  RowValue,
  TemplateTag,
  TemplateTagId,
} from "metabase-types/api";

import { TagEditorHelp } from "../TagEditorHelp";

import { SettingsPane } from "./SettingsPane";

type GetEmbeddedParamVisibility = (
  slug: string,
) => EmbeddingParameterVisibility;

type TagEditorSidebarProps = {
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
};

type TagSidebarSection = "settings" | "help";

export const TagEditorSidebar = ({
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
}: TagEditorSidebarProps) => {
  const [section, setSection] = useState<TagSidebarSection>("settings");

  const tags = query.variableTemplateTags();
  const database = question.database();
  const parameters = question.parameters();
  const parametersById = _.indexBy(parameters, "id");

  const getOpenSection = (): TagSidebarSection => {
    return tags.length === 0 ? "help" : section;
  };

  const openSection = getOpenSection();

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
            className={cx(ButtonsS.Button, CS.flexFull, ButtonsS.ButtonSmall, {
              [ButtonsS.ButtonActive]: openSection === "settings",
              [CS.disabled]: tags.length === 0,
            })}
            onClick={() => setSection("settings")}
          >{t`Settings`}</a>
          <a
            className={cx(ButtonsS.Button, CS.flexFull, ButtonsS.ButtonSmall, {
              [ButtonsS.ButtonActive]: openSection === "help",
            })}
            onClick={() => setSection("help")}
          >{t`Help`}</a>
        </div>
        {openSection === "settings" ? (
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
            switchToSettings={() => setSection("settings")}
          />
        )}
      </div>
    </SidebarContent>
  );
};
