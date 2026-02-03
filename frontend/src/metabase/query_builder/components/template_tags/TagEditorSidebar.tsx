import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

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
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
  onClose: () => void;
  getEmbeddedParameterVisibility: GetEmbeddedParamVisibility;
}

export function TagEditorSidebar({
  query,
  databases,
  question,
  sampleDatabaseId,
  setDatasetQuery,
  setTemplateTag,
  setParameterValue,
  onClose,
  getEmbeddedParameterVisibility,
}: TagEditorSidebarProps) {
  const [section, setSection] = useState<TabId>(() => {
    const tags = query.variableTemplateTags();
    return tags.length === 0 ? "help" : "settings";
  });

  const tags = query.variableTemplateTags();
  const database = question.database();
  const parameters = question.parameters();
  const parametersById = _.indexBy(parameters, "id");

  const effectiveSection = tags.length === 0 ? "help" : section;

  const handleTabChange = (tab: string | null) => {
    if (tab) {
      setSection(tab as TabId);
    }
  };

  return (
    <SidebarContent title={t`Variables and parameters`} onClose={onClose}>
      <div data-testid="tag-editor-sidebar">
        <Tabs radius={0} value={effectiveSection} onChange={handleTabChange}>
          <Tabs.List grow>
            <Tabs.Tab value="settings">{t`Settings`}</Tabs.Tab>
            <Tabs.Tab value="help">{t`Help`}</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {effectiveSection === "settings" ? (
          <SettingsPane
            tags={tags}
            parametersById={parametersById}
            database={database}
            databases={databases as Database[]}
            setTemplateTag={setTemplateTag}
            setParameterValue={setParameterValue}
            getEmbeddedParameterVisibility={getEmbeddedParameterVisibility}
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
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
  getEmbeddedParameterVisibility: GetEmbeddedParamVisibility;
}

const SettingsPane = ({
  tags,
  parametersById,
  database,
  databases,
  setTemplateTag,
  setParameterValue,
  getEmbeddedParameterVisibility,
}: SettingsPaneProps) => {
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
        setParameterValue={setParameterValue}
      />
    </div>
  ));
};
