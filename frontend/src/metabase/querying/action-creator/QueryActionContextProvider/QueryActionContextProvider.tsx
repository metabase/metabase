import { useCallback, useEffect, useMemo, useState } from "react";
import _ from "underscore";

import type {
  ActionContextProviderProps,
  ActionContextType,
  EditorBodyProps,
} from "metabase/actions/containers/ActionCreator/ActionContext";
import { ActionContext } from "metabase/actions/containers/ActionCreator/ActionContext";
import type { CreateQueryActionParams } from "metabase/actions/types";
import { getDefaultFormSettings } from "metabase/actions/utils";
import type {
  CardQuestionBuilder,
  DraftQuestionBuilder,
} from "metabase/metadata-store";
import {
  useQuestionFromCard,
  useQuestionFromOpts,
} from "metabase/metadata-store";
import type Question from "metabase-lib/v1/Question";
import { getTemplateTagParametersFromCard } from "metabase-lib/v1/parameters/utils/template-tags";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  ActionFormSettings,
  Card,
  DatabaseId,
  NativeDatasetQuery,
  VisualizationSettings,
  WritebackParameter,
  WritebackQueryAction,
} from "metabase-types/api";

import { QueryActionEditor } from "./QueryActionEditor";
import {
  setParameterTypesFromFieldSettings,
  setTemplateTagTypesFromFieldSettings,
} from "./utils";

export interface QueryActionContextProviderProps extends ActionContextProviderProps<WritebackQueryAction> {
  databaseId?: DatabaseId;
}

// ActionCreator uses the NativeQueryEditor, which expects a Question object
// This utilities help us to work with the WritebackQueryAction as with a Question

function newQuestion(
  buildDraftQuestion: DraftQuestionBuilder,
  databaseId?: DatabaseId,
) {
  return buildDraftQuestion({
    DEPRECATED_RAW_MBQL_type: "native",
    DEPRECATED_RAW_MBQL_databaseId: databaseId,
  });
}

function convertActionToQuestionCard(
  action: WritebackQueryAction,
): Card<NativeDatasetQuery> {
  return {
    id: action.id,
    entity_id: action.entity_id,
    created_at: action.created_at,
    updated_at: action.updated_at,
    name: action.name,
    description: action.description,
    dataset_query: action.dataset_query,
    display: "action",
    visualization_settings:
      // Unjustified type cast. FIXME
      action.visualization_settings as VisualizationSettings,
    type: "question",
    can_write: true,
    can_restore: false,
    can_delete: false,
    public_uuid: null,
    collection_id: null,
    collection_position: null,
    dashboard: null,
    result_metadata: [],
    cache_ttl: null,
    last_query_start: null,
    average_query_time: null,
    archived: false,
    enable_embedding: false,
    embedding_params: null,
    initially_published_at: null,
    can_manage_db: true,
    dashboard_count: null,
    dashboard_id: null,
  };
}

function convertActionToQuestion(
  action: WritebackQueryAction,
  buildQuestionFromCard: CardQuestionBuilder,
) {
  const question = buildQuestionFromCard(convertActionToQuestionCard(action));
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
    // Unjustified type cast. FIXME
    name: question.displayName() as string,
    description: question.description(),
    // Unjustified type cast. FIXME
    dataset_query: cleanQuestion.datasetQuery() as NativeDatasetQuery,
    // Unjustified type cast. FIXME
    database_id: question.databaseId() as DatabaseId,
    // Unjustified type cast. FIXME
    parameters: parameters as WritebackParameter[],
    visualization_settings: formSettings,
  };
}

interface ResolveQuestionOpts {
  buildQuestionFromCard: CardQuestionBuilder;
  buildDraftQuestion: DraftQuestionBuilder;
  databaseId?: DatabaseId;
}

function resolveQuestion(
  action: WritebackQueryAction | undefined,
  {
    buildQuestionFromCard,
    buildDraftQuestion,
    databaseId,
  }: ResolveQuestionOpts,
) {
  return action
    ? convertActionToQuestion(action, buildQuestionFromCard)
    : newQuestion(buildDraftQuestion, databaseId);
}

export function QueryActionContextProvider({
  initialAction,
  databaseId,
  children,
}: QueryActionContextProviderProps) {
  const buildQuestionFromCard = useQuestionFromCard();
  const buildDraftQuestion = useQuestionFromOpts();

  const [initialQuestion, setInitialQuestion] = useState(
    resolveQuestion(initialAction, {
      buildQuestionFromCard,
      buildDraftQuestion,
      databaseId,
    }),
  );
  const initialFormSettings = useMemo(
    () => getDefaultFormSettings(initialAction?.visualization_settings),
    [initialAction?.visualization_settings],
  );

  const [question, setQuestion] = useState(initialQuestion);

  const query = useMemo(
    // Unjustified type cast. FIXME
    () => question.legacyNativeQuery() as NativeQuery,
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
      buildQuestionFromCard,
      buildDraftQuestion,
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
    const parameters = getTemplateTagParametersFromCard(
      nextQuestion.card(),
      nextQuestion.metadata(),
    );
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
