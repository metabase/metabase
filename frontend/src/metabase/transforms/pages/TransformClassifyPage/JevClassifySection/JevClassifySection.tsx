import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  usePreviewJevClassifyMutation,
  useSuggestJevClassifyInputsMutation,
  useUpdateTransformMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useMetadataToasts } from "metabase/common/hooks";
import { Alert, Button, Divider, Group, Icon, Stack, Text } from "metabase/ui";
import type { QueryTransformSource, Transform } from "metabase-types/api";

import { JevClassifyPreview } from "./JevClassifyPreview";
import { JevClassifyStepEditor } from "./JevClassifyStepEditor";
import {
  type InputSuggestion,
  type StepDraft,
  createStepDraft,
  draftToStep,
  getSourceWithSteps,
  getStepDrafts,
  getStepError,
  getStepsError,
} from "./utils";

const PREVIEW_ROW_LIMIT = 20;
const MAX_STEPS = 1;

type JevClassifySectionProps = {
  transform: Transform;
  readOnly?: boolean;
};

export function JevClassifySection({
  transform,
  readOnly,
}: JevClassifySectionProps) {
  const { source } = transform;
  if (source.type !== "query") {
    return null;
  }
  return (
    <JevClassifySectionContent
      transform={transform}
      source={source}
      readOnly={readOnly}
    />
  );
}

type JevClassifySectionContentProps = {
  transform: Transform;
  source: QueryTransformSource;
  readOnly?: boolean;
};

function JevClassifySectionContent({
  transform,
  source,
  readOnly,
}: JevClassifySectionContentProps) {
  const [steps, setSteps] = useState(() => getStepDrafts(source));
  const {
    columnNames: sourceColumnNames,
    textColumnName,
    isLoading: isLoadingColumns,
    error: columnsError,
  } = useSourceColumns(source);
  const [previewJevClassify, previewResult] = usePreviewJevClassifyMutation();
  const [suggestInputs, { isLoading: isSuggestingInputs }] =
    useSuggestJevClassifyInputsMutation();
  const [suggestionsByStepId, setSuggestionsByStepId] = useState<
    Record<string, InputSuggestion>
  >({});
  const [suggestingStepId, setSuggestingStepId] = useState<string | null>(null);
  const latestQuestionByStepIdRef = useRef<Record<string, string>>({});
  const [updateTransform, { isLoading: isSaving }] =
    useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const savedSteps = source["jev-classify"] ?? [];
  const isDirty = !_.isEqual(steps.map(draftToStep), savedSteps);
  const stepsError = getStepsError(steps, sourceColumnNames);
  const isTableTarget = transform.target.type === "table";

  const handleStepChange = (step: StepDraft) =>
    setSteps(steps.map((s) => (s.id === step.id ? step : s)));

  const handleStepRemove = (stepId: string) =>
    setSteps(steps.filter((step) => step.id !== stepId));

  const handleStepAdd = async () => {
    const { data } = await suggestInputs({ query: source.query });
    const inputs =
      data?.suggested ?? (textColumnName != null ? [textColumnName] : []);
    const step = createStepDraft(inputs);
    setSteps([...steps, step]);
    if (data?.status === "ok") {
      setSuggestionsByStepId((suggestions) => ({
        ...suggestions,
        [step.id]: { inputs, question: "" },
      }));
    }
  };

  const handleQuestionSettled = async (stepId: string, rawQuestion: string) => {
    const question = rawQuestion.trim();
    const previous = suggestionsByStepId[stepId];
    latestQuestionByStepIdRef.current[stepId] = question;
    if (question === "" || previous?.question === question) {
      return;
    }
    setSuggestingStepId(stepId);
    const { data } = await suggestInputs({ query: source.query, question });
    const isStale = latestQuestionByStepIdRef.current[stepId] !== question;
    if (isStale) {
      return;
    }
    setSuggestingStepId(null);
    if (data?.status !== "ok") {
      return;
    }
    setSuggestionsByStepId((suggestions) => ({
      ...suggestions,
      [stepId]: { inputs: data.suggested, question },
    }));
    // Keep following Jev until the user picks columns themselves.
    setSteps((steps) =>
      steps.map((s) => {
        const isFollowingJev =
          s.inputs.length === 0 ||
          (previous != null && _.isEqual(previous.inputs, s.inputs));
        return s.id === stepId && isFollowingJev
          ? { ...s, inputs: data.suggested }
          : s;
      }),
    );
  };

  const handlePreview = () =>
    previewJevClassify({
      query: source.query,
      classify: steps.map(draftToStep),
      limit: PREVIEW_ROW_LIMIT,
    });

  const handleSave = async () => {
    const { error } = await updateTransform({
      id: transform.id,
      source: getSourceWithSteps(source, steps.map(draftToStep)),
    });
    if (error) {
      const message = getErrorMessage(error);
      sendErrorToast(
        message
          ? t`Failed to save Jev steps: ${message}`
          : t`Failed to save Jev steps`,
      );
    } else {
      sendSuccessToast(t`Jev steps saved. They apply on the next run.`);
    }
  };

  const handleReset = () => setSteps(getStepDrafts(source));

  return (
    <TitleSection
      label={t`Classify`}
      description={t`Jev reads a column of every row, answers your question, and the transform writes the answer as a column you can group and filter by.`}
    >
      <Stack p="xl" gap="lg">
        {!isTableTarget && (
          <Alert color="warning" icon={<Icon name="warning" />}>
            {t`Jev steps only run on transforms that rebuild their table. Turn off incremental processing to use them.`}
          </Alert>
        )}
        {columnsError != null && (
          <Text c="error">
            {t`Couldn't load the source columns: ${
              getErrorMessage(columnsError) ?? t`unknown error`
            }`}
          </Text>
        )}
        {steps.length === 0 && (
          <Text c="text-secondary">
            {t`No Jev step yet. Add one to categorize a column, like the topic or sentiment of free-text feedback.`}
          </Text>
        )}
        {steps.map((step) => (
          <JevClassifyStepEditor
            key={step.id}
            step={step}
            sourceColumnNames={sourceColumnNames}
            isLoadingColumns={isLoadingColumns}
            suggestion={suggestionsByStepId[step.id]}
            isSuggestingInputs={suggestingStepId === step.id}
            onQuestionSettled={(question) =>
              handleQuestionSettled(step.id, question)
            }
            error={getStepError(step, sourceColumnNames)}
            readOnly={readOnly}
            onChange={handleStepChange}
            onRemove={() => handleStepRemove(step.id)}
          />
        ))}
        {!readOnly && steps.length < MAX_STEPS && (
          <Button
            variant="subtle"
            leftSection={<Icon name="add" />}
            onClick={handleStepAdd}
            loading={isSuggestingInputs}
            w="fit-content"
          >
            {t`Add a Jev step`}
          </Button>
        )}
        {previewResult.error != null && (
          <Text c="error">
            {getErrorMessage(previewResult.error) ?? t`Preview failed.`}
          </Text>
        )}
        {previewResult.data != null && steps.length > 0 && (
          <JevClassifyPreview preview={previewResult.data} steps={steps} />
        )}
      </Stack>
      {!readOnly && (
        <>
          <Divider />
          <Group p="xl" justify="space-between">
            <Button
              leftSection={<Icon name="play" />}
              onClick={handlePreview}
              loading={previewResult.isLoading}
              disabled={steps.length === 0 || stepsError != null}
            >
              {t`Preview on ${PREVIEW_ROW_LIMIT} rows`}
            </Button>
            <Group gap="sm">
              {isDirty && <Button onClick={handleReset}>{t`Discard`}</Button>}
              <Button
                variant="filled"
                onClick={handleSave}
                loading={isSaving}
                disabled={!isDirty || stepsError != null}
              >
                {t`Save`}
              </Button>
            </Group>
          </Group>
        </>
      )}
    </TitleSection>
  );
}

/** The source query's columns, from a one-row preview with no steps. */
function useSourceColumns(source: QueryTransformSource) {
  const [previewJevClassify, { data, isLoading, error }] =
    usePreviewJevClassifyMutation();
  const query = source.query;

  useEffect(() => {
    previewJevClassify({ query, classify: [], limit: 1 });
  }, [previewJevClassify, query]);

  return useMemo(() => {
    const columns = data?.columns ?? [];
    return {
      columnNames: columns.map(({ name }) => name),
      textColumnName: columns.find(({ type }) => type === "type/Text")?.name,
      isLoading,
      error,
    };
  }, [data, isLoading, error]);
}
