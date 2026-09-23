import { t } from "ttag";

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

import type { AnswerDraft, StepDraft } from "./utils";

type JevClassifyStepEditorProps = {
  step: StepDraft;
  sourceColumnNames: readonly string[];
  isLoadingColumns?: boolean;
  error: string | null;
  readOnly?: boolean;
  onChange: (step: StepDraft) => void;
  onRemove: () => void;
};

export function JevClassifyStepEditor({
  step,
  sourceColumnNames,
  isLoadingColumns,
  error,
  readOnly,
  onChange,
  onRemove,
}: JevClassifyStepEditorProps) {
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
