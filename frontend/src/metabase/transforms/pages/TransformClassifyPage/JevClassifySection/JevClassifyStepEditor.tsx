import { useEffect, useRef } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  ActionIcon,
  Button,
  Group,
  Icon,
  MultiSelect,
  Select,
  Slider,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import { isJevClassifyOutputMode } from "metabase-types/guards";

import type { AnswerDraft, InputSuggestion, StepDraft } from "./utils";

const QUESTION_DEBOUNCE_MS = 1000;

type JevClassifyStepEditorProps = {
  step: StepDraft;
  sourceColumnNames: readonly string[];
  isLoadingColumns?: boolean;
  suggestion?: InputSuggestion;
  isSuggestingInputs?: boolean;
  error: string | null;
  readOnly?: boolean;
  onChange: (step: StepDraft) => void;
  onRemove: () => void;
  /** Called with the question once the user stops typing. */
  onQuestionSettled: (question: string) => void;
};

export function JevClassifyStepEditor({
  step,
  sourceColumnNames,
  isLoadingColumns,
  suggestion,
  isSuggestingInputs,
  error,
  readOnly,
  onChange,
  onRemove,
  onQuestionSettled,
}: JevClassifyStepEditorProps) {
  useOnQuestionSettled(step.question, onQuestionSettled);

  const columnPlaceholder = isLoadingColumns
    ? t`Loading columns…`
    : t`Pick a column`;
  const update = (changes: Partial<StepDraft>) =>
    onChange({ ...step, ...changes });

  const handleModeChange = (mode: string | null) => {
    if (mode != null && isJevClassifyOutputMode(mode)) {
      update({ mode });
    }
  };

  return (
    <Stack gap="md" p="lg" bd="1px solid var(--mb-color-border)" bdrs="md">
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <MultiSelect
          label={t`Read columns`}
          description={
            <InputSuggestionHint
              suggestion={suggestion}
              inputs={step.inputs}
              isSuggesting={isSuggestingInputs}
              readOnly={readOnly}
              onApply={(inputs) => update({ inputs })}
            />
          }
          data={[...sourceColumnNames]}
          value={step.inputs}
          onChange={(inputs) => update({ inputs })}
          placeholder={step.inputs.length === 0 ? columnPlaceholder : undefined}
          nothingFoundMessage={t`No columns found`}
          searchable
          disabled={readOnly}
          flex={1}
        />
        {!readOnly && (
          <ActionIcon
            aria-label={t`Remove step`}
            variant="subtle"
            onClick={onRemove}
          >
            <Icon name="trash" />
          </ActionIcon>
        )}
      </Group>
      <TextInput
        label={t`Question`}
        placeholder={
          step.kind === "choice"
            ? t`What is this review complaining about?`
            : t`Is the reviewer angry?`
        }
        value={step.question}
        onChange={(event) => update({ question: event.target.value })}
        disabled={readOnly}
      />
      {step.kind === "choice" && (
        <AnswersEditor
          answers={step.answers}
          readOnly={readOnly}
          onChange={(answers) => update({ answers })}
        />
      )}
      <Group align="flex-end" wrap="nowrap">
        <Select
          label={t`Write to`}
          data={[
            { value: "new-column", label: t`A new column` },
            { value: "fill-empty", label: t`Empty values of a column` },
            { value: "overwrite", label: t`Every value of a column` },
          ]}
          value={step.mode}
          onChange={handleModeChange}
          disabled={readOnly}
          w="14rem"
        />
        {step.mode === "new-column" ? (
          <TextInput
            label={t`New column name`}
            value={step.column}
            onChange={(event) => update({ column: event.target.value })}
            disabled={readOnly}
            flex={1}
          />
        ) : (
          <Select
            label={t`Column`}
            data={[...sourceColumnNames]}
            value={step.column || null}
            onChange={(column) => update({ column: column ?? "" })}
            placeholder={columnPlaceholder}
            nothingFoundMessage={t`No columns found`}
            searchable
            disabled={readOnly}
            flex={1}
          />
        )}
      </Group>
      {step.kind === "choice" && (
        <Stack gap="xs">
          <Text fw="bold">{t`Minimum confidence`}</Text>
          <Text c="text-secondary" size="sm">
            {step.mode === "new-column"
              ? t`Answers below this are written as "unsure".`
              : t`Answers below this keep the original value.`}
          </Text>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={step.minConfidence ?? 0}
            onChange={(minConfidence) => update({ minConfidence })}
            label={(value) => `${Math.round(value * 100)}%`}
            disabled={readOnly}
            maw="24rem"
          />
        </Stack>
      )}
      {error != null && (
        <Text c="error" size="sm">
          {error}
        </Text>
      )}
    </Stack>
  );
}

type AnswersEditorProps = {
  answers: AnswerDraft[];
  readOnly?: boolean;
  onChange: (answers: AnswerDraft[]) => void;
};

function AnswersEditor({ answers, readOnly, onChange }: AnswersEditorProps) {
  const updateAnswer = (index: number, changes: Partial<AnswerDraft>) =>
    onChange(
      answers.map((answer, i) =>
        i === index ? { ...answer, ...changes } : answer,
      ),
    );

  return (
    <Stack gap="xs">
      <Text fw="bold">{t`Answers`}</Text>
      <Text c="text-secondary" size="sm">
        {t`Jev picks exactly one. The description is the guidance it reads.`}
      </Text>
      {answers.map((answer, index) => (
        <Group key={index} gap="sm" wrap="nowrap">
          <TextInput
            aria-label={t`Answer`}
            placeholder={t`shipping`}
            value={answer.key}
            onChange={(event) =>
              updateAnswer(index, { key: event.target.value })
            }
            disabled={readOnly}
            w="12rem"
          />
          <TextInput
            aria-label={t`Description`}
            placeholder={t`late, lost or damaged delivery`}
            value={answer.description}
            onChange={(event) =>
              updateAnswer(index, { description: event.target.value })
            }
            disabled={readOnly}
            flex={1}
          />
          {!readOnly && (
            <ActionIcon
              aria-label={t`Remove answer`}
              variant="subtle"
              onClick={() => onChange(answers.filter((_, i) => i !== index))}
            >
              <Icon name="close" />
            </ActionIcon>
          )}
        </Group>
      ))}
      {!readOnly && (
        <Button
          variant="subtle"
          leftSection={<Icon name="add" />}
          onClick={() => onChange([...answers, { key: "", description: "" }])}
          w="fit-content"
        >
          {t`Add answer`}
        </Button>
      )}
    </Stack>
  );
}

type InputSuggestionHintProps = {
  suggestion: InputSuggestion | undefined;
  inputs: string[];
  isSuggesting?: boolean;
  readOnly?: boolean;
  onApply: (inputs: string[]) => void;
};

function InputSuggestionHint({
  suggestion,
  inputs,
  isSuggesting,
  readOnly,
  onApply,
}: InputSuggestionHintProps) {
  if (isSuggesting) {
    return t`Jev is picking columns for this question…`;
  }
  if (suggestion == null || suggestion.inputs.length === 0) {
    return null;
  }
  if (_.isEqual(suggestion.inputs, inputs)) {
    return suggestion.question === ""
      ? t`Suggested by Jev: the columns most worth reading.`
      : t`Suggested by Jev for this question.`;
  }
  if (readOnly) {
    return null;
  }
  const columnList = suggestion.inputs.join(", ");
  return (
    <Button
      variant="subtle"
      size="compact-sm"
      p={0}
      onClick={() => onApply(suggestion.inputs)}
    >
      {t`Use Jev's suggestion: ${columnList}`}
    </Button>
  );
}

/** Calls `onSettled` once `question` stops changing, but not for the question the step loaded with. */
function useOnQuestionSettled(
  question: string,
  onSettled: (question: string) => void,
) {
  const debouncedQuestion = useDebouncedValue(question, QUESTION_DEBOUNCE_MS);
  const settledQuestionRef = useRef(question);
  const onSettledRef = useLatest(onSettled);

  useEffect(() => {
    if (debouncedQuestion !== settledQuestionRef.current) {
      settledQuestionRef.current = debouncedQuestion;
      onSettledRef.current(debouncedQuestion);
    }
  }, [debouncedQuestion, onSettledRef]);
}
