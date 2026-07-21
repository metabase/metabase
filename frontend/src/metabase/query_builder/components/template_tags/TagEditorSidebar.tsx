import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { EmptyState } from "metabase/common/components/EmptyState";
import type { EmbeddingParameterVisibility } from "metabase/public/lib/types";
import { SidebarContent } from "metabase/query_builder/components/SidebarContent";
import { Box, Tabs } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  DatabaseId,
  NativeDatasetQuery,
  Parameter,
  ParameterId,
  ParameterValuesConfig,
  RowValue,
  TemplateTag,
  TemplateTagId,
} from "metabase-types/api";

import { TagEditorHelp } from "./TagEditorHelp";
import { TagEditorParam } from "./TagEditorParam";

type TabId = "settings" | "help";

type GetEmbeddedParamVisibility = (
  slug: string,
) => EmbeddingParameterVisibility;

interface TagEditorSidebarProps {
  query: NativeQuery;
  databases?: Database[];
  question: Question;
  sampleDatabaseId: DatabaseId;
  setDatasetQuery: (query: NativeDatasetQuery) => void;
  setTemplateTag: (tag: TemplateTag) => void;
  setTemplateTagConfig?: (
    tag: TemplateTag,
    config: ParameterValuesConfig,
  ) => void;
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
  onClose: () => void;
  getEmbeddedParameterVisibility: GetEmbeddedParamVisibility;
  parametersAreUserVisible?: boolean;
}

export function TagEditorSidebar({
  query,
  databases,
  question,
  sampleDatabaseId,
  setDatasetQuery,
  setTemplateTag,
  setTemplateTagConfig,
  setParameterValue,
  onClose,
  getEmbeddedParameterVisibility,
  parametersAreUserVisible = true,
}: TagEditorSidebarProps) {
  const [section, setSection] = useState<TabId>("settings");

  const tags = query.variableTemplateTags();
  const database = question.database();
  const parameters = question.parameters();
  const parametersById = _.indexBy(parameters, "id");

  const handleTabChange = (tab: string | null) => {
    if (tab) {
      setSection(tab as TabId);
    }
  };

  return (
    <SidebarContent title={t`Variables and parameters`} onClose={onClose}>
      <div data-testid="tag-editor-sidebar">
        <Tabs radius={0} value={section} onChange={handleTabChange}>
          <Tabs.List grow>
            <Tabs.Tab value="settings">{t`Settings`}</Tabs.Tab>
            <Tabs.Tab value="help">{t`Help`}</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {section === "settings" ? (
          <SettingsPane
            tags={tags}
            parametersById={parametersById}
            database={database}
            databases={databases as Database[]}
            setTemplateTag={setTemplateTag}
            setTemplateTagConfig={setTemplateTagConfig}
            setParameterValue={setParameterValue}
            getEmbeddedParameterVisibility={getEmbeddedParameterVisibility}
            parametersAreUserVisible={parametersAreUserVisible}
          />
        ) : (
          <Box p="lg">
            <TagEditorHelp
              database={database}
              sampleDatabaseId={sampleDatabaseId}
              setDatasetQuery={setDatasetQuery}
              switchToSettings={() => setSection("settings")}
            />
          </Box>
        )}
      </div>
    </SidebarContent>
  );
}

interface SettingsPaneProps {
  tags: TemplateTag[];
  database?: Database | null;
  databases: Database[];
  parametersById: Record<ParameterId, Parameter>;
  setTemplateTag: (tag: TemplateTag) => void;
  setTemplateTagConfig?: (
    tag: TemplateTag,
    config: ParameterValuesConfig,
  ) => void;
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
  getEmbeddedParameterVisibility: GetEmbeddedParamVisibility;
  parametersAreUserVisible?: boolean;
}

const SettingsPane = ({
  tags,
  parametersById,
  database,
  databases,
  setTemplateTag,
  setTemplateTagConfig,
  setParameterValue,
  getEmbeddedParameterVisibility,
  parametersAreUserVisible = true,
}: SettingsPaneProps) => {
  if (tags.length === 0) {
    return (
      <Box p="lg">
        <EmptyState
          message={t`Add a variable to your query, like {{variable_name}}, to configure it here.`}
        />
      </Box>
    );
  }

  return tags.map((tag) => (
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
        database={database}
        databases={databases}
        setTemplateTag={setTemplateTag}
        setTemplateTagConfig={setTemplateTagConfig}
        setParameterValue={setParameterValue}
        parametersAreUserVisible={parametersAreUserVisible}
      />
    </div>
  ));
};
