import { useFormikContext } from "formik";
import { useState } from "react";
import { jt, t } from "ttag";

import { skipToken } from "metabase/api";
import {
  type JevSaveCheck,
  type JevSaveCheckDuplicate,
  type JevSaveCheckRequest,
  useCheckNewQuestionQuery,
} from "metabase/api/jev-saving";
import { Link } from "metabase/common/components/Link";
import { Box, Button, Group, Icon, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { useSaveQuestionContext } from "../context";
import type { FormValues } from "../types";

function getCheckRequest(
  question: Question,
  originalQuestion: Question | null,
  suggestedName: string,
): JevSaveCheckRequest | null {
  const datasetQuery = question.datasetQuery();
  if (!datasetQuery?.database) {
    return null;
  }
  const originalId = originalQuestion?.isSaved()
    ? originalQuestion.id()
    : undefined;
  return {
    dataset_query: datasetQuery,
    name: suggestedName || question.displayName() || undefined,
    display: question.display(),
    type: question.type(),
    exclude_card_id: originalId,
  };
}

/**
 * Fires the Jev save-time check once per modal (the request is frozen at first render so typing in
 * the form never refires it). Both hint components share the same RTK cache entry.
 */
export function useJevSaveCheck(): JevSaveCheck | undefined {
  const { question, originalQuestion, initialValues } =
    useSaveQuestionContext();
  const [request] = useState(() =>
    getCheckRequest(question, originalQuestion, initialValues.name),
  );
  const { data, isError } = useCheckNewQuestionQuery(request ?? skipToken);
  if (isError || !data || data.status !== "ok") {
    return undefined;
  }
  return data;
}

function JevReadout({ elapsedMs }: { elapsedMs: number }) {
  return (
    <Text
      component="span"
      size="xs"
      c="text-tertiary"
      data-testid="jev-save-readout"
    >
      {t`Jev · ${Math.round(elapsedMs)}ms`}
    </Text>
  );
}

function getCardPath({ card_id, type }: JevSaveCheckDuplicate) {
  return `/${type ?? "question"}/${card_id}`;
}

export function JevDuplicateCallout() {
  const check = useJevSaveCheck();
  const duplicate = check?.duplicate;
  if (!check || !duplicate) {
    return null;
  }

  const pct = Math.round(duplicate.confidence * 100);
  const cardLink = (
    <Link
      key="card"
      to={getCardPath(duplicate)}
      target="_blank"
      rel="noopener noreferrer"
      variant="brandBold"
    >
      {duplicate.name}
    </Link>
  );

  return (
    <Box
      data-testid="jev-duplicate-callout"
      mb="lg"
      px="md"
      py="sm"
      bd="1px solid var(--mb-color-border)"
      bg="background-secondary"
      style={{ borderRadius: "var(--mantine-radius-md)" }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Icon name="sparkles" c="brand" mt={2} />
        <Box style={{ flex: 1 }}>
          <Text size="sm">{jt`Heads up — ${cardLink} already answers this.`}</Text>
          <Group gap="xs" mt={2}>
            <Text size="xs" c="text-secondary">
              {duplicate.collection_name
                ? t`${pct}% match · in ${duplicate.collection_name}`
                : t`${pct}% match`}
            </Text>
            <JevReadout elapsedMs={check.elapsed_ms} />
          </Group>
        </Box>
      </Group>
    </Box>
  );
}

export function JevCollectionSuggestion() {
  const check = useJevSaveCheck();
  const { values, setFieldValue } = useFormikContext<FormValues>();
  const suggestion = check?.collection;

  if (!check || !suggestion || values.collection_id === suggestion.id) {
    return null;
  }

  const handleClick = () => {
    setFieldValue("collection_id", suggestion.id);
    setFieldValue("dashboard_id", undefined);
    setFieldValue("dashboard_tab_id", undefined);
  };

  const name = (
    <Text key="name" component="span" fw="bold" c="inherit" fz="inherit">
      {suggestion.name}
    </Text>
  );

  return (
    <Group gap="sm" mt="sm" data-testid="jev-collection-suggestion">
      <Button
        size="sm"
        variant="light"
        radius="xl"
        leftSection={<Icon name="sparkles" size={12} />}
        onClick={handleClick}
      >
        {jt`Save to ${name} instead?`}
      </Button>
      {!check.duplicate && <JevReadout elapsedMs={check.elapsed_ms} />}
    </Group>
  );
}
