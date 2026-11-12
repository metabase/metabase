import { useRef } from "react";

import { useListDatabasesQuery } from "metabase/api";
import type { TemplateTagsSidebarProps } from "metabase/querying/editor/types";
import { setTemplateTag, setTemplateTagConfig } from "metabase/querying/native";
import type * as Lib from "metabase-lib";

import { TagEditorSidebar } from "./TagEditor/TagEditorSidebar";

const VISIBILITY_ALWAYS_ENABLED = () => "enabled" as const;

export function TemplateTagsSidebar({
  question,
  query,
  onClose,
  setParameterValues,
  parameterValues,
  parametersAreUserVisible,
  onChangeQuery,
  canUseSampleDatabase,
}: TemplateTagsSidebarProps) {
  const { data: databases } = useListDatabasesQuery();
  const sampleDatabaseId = databases?.data.find(
    (database) => database.is_sample,
  )?.id;

  // Switching a variable's type calls setTemplateTag and setTemplateTagConfig within one event handler.
  // React props don't update between those synchronous calls,
  // so each change is composed on top of the latest query held in this ref.
  const latestQueryRef = useRef(query);
  latestQueryRef.current = query;

  const commitQuery = (newQuery: Lib.Query) => {
    latestQueryRef.current = newQuery;
    onChangeQuery(newQuery);
  };

  return (
    <TagEditorSidebar
      question={question}
      onClose={onClose}
      sampleDatabaseId={
        canUseSampleDatabase === false ? undefined : sampleDatabaseId
      }
      setTemplateTag={(tag) => {
        commitQuery(setTemplateTag(latestQueryRef.current, tag));
      }}
      setParameterValue={(tagId, value) => {
        setParameterValues({
          ...parameterValues,
          [tagId]: value,
        });
      }}
      setTemplateTagConfig={(tag, config) => {
        const latestQuestion = question.setQuery(latestQueryRef.current);
        commitQuery(setTemplateTagConfig(latestQuestion, tag, config).query());
      }}
      setQuery={commitQuery}
      getEmbeddedParameterVisibility={VISIBILITY_ALWAYS_ENABLED}
      parametersAreUserVisible={parametersAreUserVisible}
    />
  );
}
