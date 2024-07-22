import { useCallback, useEffect, useMemo, useState } from "react";
import _ from "underscore";

import type { CreateQueryActionParams } from "metabase/entities/actions";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { getTemplateTagParametersFromCard } from "metabase-lib/v1/parameters/utils/template-tags";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Card,
  ActionFormSettings,
  DatabaseId,
  NativeDatasetQuery,
  VisualizationSettings,
  WritebackParameter,
  WritebackQueryAction,
} from "metabase-types/api";

import { getDefaultFormSettings } from "../../../../utils";
import type { ActionContextType } from "../ActionContext";
import { ActionContext } from "../ActionContext";
import type { ActionContextProviderProps, EditorBodyProps } from "../types";

import QueryActionEditor from "./QueryActionEditor";
import {
  setParameterTypesFromFieldSettings,
  setTemplateTagTypesFromFieldSettings,
} from "./utils";

export interface QueryActionContextProviderProps
  extends ActionContextProviderProps<WritebackQueryAction> {
  metadata: Metadata;
  databaseId?: DatabaseId;
}

// ActionCreator uses the NativeQueryEditor, which expects a Question object
// This utilities help us to work with the WritebackQueryAction as with a Question

function newQuestion(metadata: Metadata, databaseId?: DatabaseId) {
  return new Question(
    {
      dataset_query: {
        type: "native",
        database: databaseId ?? null,
        native: {
          query: "",
        },
      },
    },
    metadata,
  );
}

function convertActionToQuestionCard(
  action: WritebackQueryAction,
): Card<NativeDatasetQuery> {
  return {
    id: action.id,
    created_at: action.created_at,
    updated_at: action.updated_at,
    name: action.name,
    description: action.description,
    dataset_query: action.dataset_query,
    display: "action",
    visualization_settings:
      action.visualization_settings as VisualizationSettings,

    type: "question",
    can_write: true,
    public_uuid: null,
    collection_id: null,
    collection_position: null,
    result_metadata: [],
    cache_ttl: null,
    last_query_start: null,
    average_query_time: null,
    archived: false,
    enable_embedding: false,
    embedding_params: null,
    initially_published_at: null,
  };
}

function convertActionToQuestion(
  action: WritebackQueryAction,
  metadata: Metadata,
) {
  const question = new Question(convertActionToQuestionCard(action), metadata);
  return question.setParameters(action.parameters);
}

function convertQuestionToAction(
  question: Question,
  formSettings: ActionFormSettings,
) {
  const cleanQuestion = setTemplateTagTypesFromFieldSettings(
    question,
    formSettings,
  );
  const parameters = setParameterTypesFromFieldSettings(
    formSettings,
    cleanQuestion.parameters(),
  );

  return {
    id: question.id(),
    name: question.displayName() as string,
    description: question.description(),
    dataset_query: cleanQuestion.datasetQuery() as NativeDatasetQuery,
    database_id: question.databaseId() as DatabaseId,
    parameters: parameters as WritebackParameter[],
    visualization_settings: formSettings,
  };
}

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
  const [initialQuestion, setInitialQuestion] = useState(
    resolveQuestion(initialAction, { metadata, databaseId }),
  );
  const initialFormSettings = useMemo(
    () => getDefaultFormSettings(initialAction?.visualization_settings),
    [initialAction?.visualization_settings],
  );

  const [question, setQuestion] = useState(initialQuestion);

  const query = useMemo(
    () => question.legacyQuery() as NativeQuery,
    [question],
  );

  const [formSettings, setFormSettings] = useState(initialFormSettings);

  const action = useMemo(() => {
    const action = convertQuestionToAction(question, formSettings);
    return {
      ...initialAction,
      ...action,
      type: "query" as const,
    };
  }, [initialAction, question, formSettings]);

  const isNew = !initialAction && !question.isSaved();
  const canSave = !query.isEmpty();

  useEffect(() => {
    const newQuestion = resolveQuestion(initialAction, {
      metadata,
      databaseId,
    });
    setInitialQuestion(newQuestion);
    setQuestion(newQuestion);
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

  const handleQueryChange = useCallback((nextQuery: NativeQuery) => {
    const nextQuestion = nextQuery.question();
    const parameters = getTemplateTagParametersFromCard(nextQuestion.card());
    setQuestion(nextQuestion.setParameters(parameters));
  }, []);

  const renderEditorBody = useCallback(
    ({ isEditable }: EditorBodyProps) => (
      <QueryActionEditor
        query={query}
        question={question}
        isEditable={isEditable}
        onChangeQuestionQuery={handleQueryChange}
      />
    ),
    [query, question, handleQueryChange],
  );

  const isDirty = useMemo(() => {
    const isQuestionDirty = question.isDirtyComparedTo(initialQuestion);
    const areFormSettingsDirty = !_.isEqual(formSettings, initialFormSettings);
    return isQuestionDirty || areFormSettingsDirty;
  }, [question, initialQuestion, formSettings, initialFormSettings]);

  const value = useMemo(
    (): ActionContextType => ({
      action,
      formSettings,
      isNew,
      canSave,
      isDirty,
      ui: {
        canRename: true,
        canChangeFieldSettings: true,
      },
      handleActionChange,
      handleFormSettingsChange: setFormSettings,
      renderEditorBody,
    }),
    [
      action,
      formSettings,
      isNew,
      canSave,
      isDirty,
      handleActionChange,
      renderEditorBody,
    ],
  );

  return (
    <ActionContext.Provider value={value}>{children}</ActionContext.Provider>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QueryActionContextProvider;
