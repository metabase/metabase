import React, { useCallback, useEffect, useMemo, useState } from "react";

import { CreateQueryActionParams } from "metabase/entities/actions";
import QueryActionEditor from "metabase/actions/containers/ActionCreator/QueryActionEditor";

import type { DatabaseId, WritebackQueryAction } from "metabase-types/api";
import type Metadata from "metabase-lib/metadata/Metadata";
import type NativeQuery from "metabase-lib/queries/NativeQuery";

import { getTemplateTagParametersFromCard } from "metabase-lib/parameters/utils/template-tags";

import { getDefaultFormSettings } from "../../../utils";
import {
  newQuestion,
  convertActionToQuestion,
  convertQuestionToAction,
} from "../utils";

import { ActionContext } from "./ActionContext";
import type { ActionContextProviderProps, EditorBodyProps } from "./types";

export interface QueryActionContextProviderProps
  extends ActionContextProviderProps<WritebackQueryAction> {
  metadata: Metadata;
  databaseId?: DatabaseId;
}

const EXAMPLE_QUERY =
  "UPDATE products\nSET rating = {{ my_new_value }}\nWHERE id = {{ my_primary_key }}";

function resolveQuestion(
  action: WritebackQueryAction | undefined,
  { metadata, databaseId }: { metadata: Metadata; databaseId?: DatabaseId },
) {
  return action
    ? convertActionToQuestion(action, metadata)
    : newQuestion(metadata, databaseId);
}

function QueryActionContextProvider({
  initialAction,
  metadata,
  databaseId,
  children,
}: QueryActionContextProviderProps) {
  const [question, setQuestion] = useState(
    resolveQuestion(initialAction, { metadata, databaseId }),
  );

  const query = useMemo(() => question.query() as NativeQuery, [question]);

  const [formSettings, setFormSettings] = useState(
    getDefaultFormSettings(initialAction?.visualization_settings),
  );

  const action = useMemo(() => {
    const action = convertQuestionToAction(question, formSettings);
    return {
      ...initialAction,
      ...action,
      type: "query",
    };
  }, [initialAction, question, formSettings]);

  const isNew = !initialAction && !question.isSaved();
  const canSave = !query.isEmpty();

  useEffect(() => {
    setQuestion(resolveQuestion(initialAction, { metadata, databaseId }));
    // we do not want to update this any time
    // the props or metadata change, only if action id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction?.id]);

  const handleActionChange = useCallback(
    (values: Partial<CreateQueryActionParams>) => {
      let nextQuestion = question.clone();

      if (values.name) {
        nextQuestion = nextQuestion.setDisplayName(values.name);
      }

      if (values.description) {
        nextQuestion = nextQuestion.setDescription(values.description);
      }

      setQuestion(nextQuestion);
    },
    [question],
  );

  const handleSetupExample = useCallback(() => {
    const nextQuery = query.setQueryText(query.queryText() + EXAMPLE_QUERY);
    setQuestion(question.setQuery(nextQuery));
  }, [question, query]);

  const handleQueryChange = useCallback((nextQuery: NativeQuery) => {
    const nextQuestion = nextQuery.question();
    const parameters = getTemplateTagParametersFromCard(nextQuestion.card());
    setQuestion(nextQuestion.setParameters(parameters));
  }, []);

  const renderEditorBody = useCallback(
    ({ isEditable }: EditorBodyProps) => (
      <QueryActionEditor
        query={query}
        isEditable={isEditable}
        onChangeQuestionQuery={handleQueryChange}
      />
    ),
    [query, handleQueryChange],
  );

  const value = useMemo(
    () => ({
      action,
      formSettings,
      isNew,
      canSave,
      ui: {
        canRename: true,
        canChangeFieldSettings: true,
      },
      handleActionChange,
      handleFormSettingsChange: setFormSettings,
      handleSetupExample,
      renderEditorBody,
    }),
    [
      action,
      formSettings,
      isNew,
      canSave,
      handleActionChange,
      setFormSettings,
      handleSetupExample,
      renderEditorBody,
    ],
  );

  return (
    <ActionContext.Provider value={value}>{children}</ActionContext.Provider>
  );
}

export default QueryActionContextProvider;
