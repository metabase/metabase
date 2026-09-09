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
import { useSelector } from "metabase/redux";
import type Question from "metabase-lib/v1/Question";
import { getTemplateTagParametersFromCard } from "metabase-lib/v1/parameters/utils/template-tags";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  ActionFormSettings,
  DatabaseId,
  NativeDatasetQuery,
  WritebackParameter,
  WritebackQueryAction,
} from "metabase-types/api";

import { QueryActionEditor } from "./QueryActionEditor";
import { getActionQuestion } from "./selectors";
import {
  setParameterTypesFromFieldSettings,
  setTemplateTagTypesFromFieldSettings,
} from "./utils";

export interface QueryActionContextProviderProps extends ActionContextProviderProps<WritebackQueryAction> {
  databaseId?: DatabaseId;
}

// ActionCreator uses the NativeQueryEditor, which expects a Question object
// This utilities help us to work with the WritebackQueryAction as with a Question

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

export function QueryActionContextProvider({
  initialAction,
  databaseId,
  children,
}: QueryActionContextProviderProps) {
  const resolvedQuestion = useSelector((state) =>
    getActionQuestion(state, initialAction, databaseId),
  );

  const [initialQuestion, setInitialQuestion] = useState(resolvedQuestion);
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
    setInitialQuestion(resolvedQuestion);
    setQuestion(resolvedQuestion);
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
