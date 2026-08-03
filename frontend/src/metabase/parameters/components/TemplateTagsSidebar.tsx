import { useRef } from "react";

import type { TemplateTagsSidebarProps } from "metabase/querying/editor/types";
import { getSampleDatabaseId } from "metabase/querying/selectors";
import { useSelector } from "metabase/redux";
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
  const sampleDatabaseId = useSelector(getSampleDatabaseId);

  // The template-tag editor fires several query mutations within a single event
  // handler (e.g. switching a variable's type updates both the tag and its
  // value-source config). React props don't update between those synchronous
  // calls, so we track the latest query in a ref and compose each change on top
  // of it; otherwise the second `onChangeQuery` would clobber the first.
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
