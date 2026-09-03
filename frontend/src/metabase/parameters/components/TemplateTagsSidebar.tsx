import { useRef } from "react";

import { useListDatabasesQuery } from "metabase/api";
import type { TemplateTagsSidebarProps } from "metabase/querying/editor/types";
import * as Lib from "metabase-lib";

import { TagEditorSidebar } from "./template_tags/TagEditorSidebar";

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
      query={question.legacyNativeQuery()!}
      onClose={onClose}
      sampleDatabaseId={
        canUseSampleDatabase === false ? undefined : sampleDatabaseId
      }
      setTemplateTag={(tag) => {
        const currentQuery = latestQueryRef.current;
        const templateTags = Lib.templateTags(currentQuery);
        commitQuery(
          Lib.withTemplateTags(currentQuery, {
            ...templateTags,
            [tag.name]: tag,
          }),
        );
      }}
      setParameterValue={(tagId, value) => {
        setParameterValues({
          ...parameterValues,
          [tagId]: value,
        });
      }}
      setTemplateTagConfig={(tag, config) => {
        const newQuery = question
          .setQuery(latestQueryRef.current)
          .legacyNativeQuery()!
          .setTemplateTagConfig(tag, config);
        commitQuery(newQuery.question().query());
      }}
      setDatasetQuery={(newQuery) => {
        commitQuery(question.setDatasetQuery(newQuery).query());
      }}
      getEmbeddedParameterVisibility={VISIBILITY_ALWAYS_ENABLED}
      parametersAreUserVisible={parametersAreUserVisible}
    />
  );
}
