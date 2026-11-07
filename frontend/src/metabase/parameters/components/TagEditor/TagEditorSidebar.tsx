import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { EmptyState } from "metabase/common/components/EmptyState";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { getVariableTemplateTags } from "metabase/querying/native";
import { Box, Tabs } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  DatabaseId,
  EmbeddingParameterVisibility,
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
  databases?: Database[];
  question: Question;
  originalQuestion?: Question;
  sampleDatabaseId?: DatabaseId;
  setQuery: (query: Lib.Query) => void;
  setTemplateTag: (tag: TemplateTag) => void;
  setTemplateTagConfig: (
    tag: TemplateTag,
    config: ParameterValuesConfig,
  ) => void;
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
  onClose: () => void;
  getEmbeddedParameterVisibility: GetEmbeddedParamVisibility;
  parametersAreUserVisible?: boolean;
}

export function TagEditorSidebar({
  databases,
  question,
  originalQuestion,
  sampleDatabaseId,
  setQuery,
  setTemplateTag,
  setTemplateTagConfig,
  setParameterValue,
  onClose,
  getEmbeddedParameterVisibility,
  parametersAreUserVisible = true,
}: TagEditorSidebarProps) {
  const [section, setSection] = useState<TabId>("settings");

  const tags = getVariableTemplateTags(question.query());
  const database = question.database();
  const parameters = question.parameters();
  const parametersById = _.indexBy(parameters, "id");

  const handleTabChange = (tab: TabId | null) => {
    if (tab) {
      setSection(tab);
    }
  };

  return (
    <SidebarContent title={t`Variables and parameters`} onClose={onClose}>
      <div data-testid="tag-editor-sidebar">
        <Tabs value={section} onChange={handleTabChange}>
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
            // Unjustified type cast. FIXME
            databases={databases as Database[]}
            originalQuestion={originalQuestion}
            setTemplateTag={setTemplateTag}
            setTemplateTagConfig={setTemplateTagConfig}
            setParameterValue={setParameterValue}
            getEmbeddedParameterVisibility={getEmbeddedParameterVisibility}
            parametersAreUserVisible={parametersAreUserVisible}
          />
        ) : (
          <Box p="xl">
            <TagEditorHelp
              database={database}
              sampleDatabaseId={sampleDatabaseId}
              setQuery={setQuery}
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
  originalQuestion?: Question;
  setTemplateTag: (tag: TemplateTag) => void;
  setTemplateTagConfig: (
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
  originalQuestion,
  setTemplateTag,
  setTemplateTagConfig,
  setParameterValue,
  getEmbeddedParameterVisibility,
  parametersAreUserVisible = true,
}: SettingsPaneProps) => {
  if (tags.length === 0) {
    return (
      <Box p="xl">
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
        originalQuestion={originalQuestion}
        setTemplateTag={setTemplateTag}
        setTemplateTagConfig={setTemplateTagConfig}
        setParameterValue={setParameterValue}
        parametersAreUserVisible={parametersAreUserVisible}
      />
    </div>
  ));
};
