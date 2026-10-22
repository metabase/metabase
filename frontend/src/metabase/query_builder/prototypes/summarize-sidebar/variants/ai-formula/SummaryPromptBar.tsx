import { useState } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { useSuggestSummaryPlanMutation } from "metabase/metabot/api";
import {
  Box,
  Button,
  Flex,
  Icon,
  Kbd,
  Loader,
  Paper,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { Database } from "metabase-types/api";

import type {
  SummaryBase,
  SummaryDefinition,
} from "../../../../components/view/SummarySidebar/types";

import S from "./SummarySidebar.module.css";
import { applySummaryPlan, getPlanRequest } from "./ai-formula";

const EXAMPLE_PROMPTS = [
  "revenue by category per month",
  "average order total by state",
  "how many orders per year",
];

type PlanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "applied";
      appliedDefinition: SummaryDefinition;
      previousDefinition: SummaryDefinition;
      skippedCount: number;
    };

type SummaryPromptBarProps = {
  base: SummaryBase;
  database: Database | undefined;
  definition: SummaryDefinition;
  onChange: (definition: SummaryDefinition) => void;
};

/**
 * A floating bar at the bottom of the page: describe a summary ("revenue by category per month") and
 * AI fills the wells with it, replacing what they held. Undo puts the previous summary back.
 */
export function SummaryPromptBar({
  base,
  database,
  definition,
  onChange,
}: SummaryPromptBarProps) {
  const [prompt, setPrompt] = useState("");
  const [planState, setPlanState] = useState<PlanState>({ status: "idle" });
  const [suggestPlan] = useSuggestSummaryPlanMutation();
  const isLoading = planState.status === "loading";
  // Undo only while the wells still hold the generated summary, so it never discards later edits
  const canUndo =
    planState.status === "applied" &&
    planState.appliedDefinition === definition;

  const handleSubmit = async (text = prompt) => {
    const trimmedText = text.trim();
    if (trimmedText.length === 0 || isLoading) {
      return;
    }
    setPrompt(trimmedText);
    setPlanState({ status: "loading" });
    const { data } = await suggestPlan(getPlanRequest(base, trimmedText));
    if (data == null) {
      setPlanState({
        status: "error",
        message: t`Couldn't generate a summary. Try again.`,
      });
      return;
    }
    if (data.error != null) {
      setPlanState({ status: "error", message: data.error });
      return;
    }
    const { definition: plannedDefinition, skippedCount } = applySummaryPlan(
      base,
      database,
      data,
    );
    const isEmpty =
      plannedDefinition.values.length === 0 &&
      plannedDefinition.columns.length === 0;
    if (isEmpty) {
      setPlanState({
        status: "error",
        message: t`Couldn't match that to this data. Try naming a column.`,
      });
      return;
    }
    onChange(plannedDefinition);
    setPlanState({
      status: "applied",
      appliedDefinition: plannedDefinition,
      previousDefinition: definition,
      skippedCount,
    });
  };

  const handleUndo = () => {
    if (planState.status === "applied") {
      onChange(planState.previousDefinition);
    }
    setPlanState({ status: "idle" });
  };

  const message = getMessage(planState, canUndo);

  return createPortal(
    <Box className={S.promptBar} data-testid="summary-prompt-bar">
      {message != null && (
        <Text
          className={S.promptBarMessage}
          c={planState.status === "error" ? "feedback-negative" : undefined}
        >
          {message}
        </Text>
      )}
      {prompt.length === 0 && planState.status === "idle" && (
        <Flex className={S.promptBarExamples}>
          {EXAMPLE_PROMPTS.map((example) => (
            <UnstyledButton
              key={example}
              className={S.promptBarExample}
              bg="background_page-primary"
              onClick={() => handleSubmit(example)}
            >
              {example}
            </UnstyledButton>
          ))}
        </Flex>
      )}
      <Paper className={S.promptBarField} radius="xl" shadow="md" withBorder>
        {isLoading ? (
          <Loader size="xs" />
        ) : (
          <Icon name="sparkles" className={S.promptBarIcon} aria-hidden />
        )}
        <input
          className={S.promptBarInput}
          value={prompt}
          readOnly={isLoading}
          placeholder={t`Describe a summary, e.g. revenue by category per month`}
          aria-label={t`Describe a summary`}
          onChange={(event) => {
            setPrompt(event.currentTarget.value);
            if (planState.status === "error") {
              setPlanState({ status: "idle" });
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSubmit();
            }
          }}
        />
        {canUndo ? (
          <Button
            size="compact-sm"
            variant="subtle"
            leftSection={<Icon name="undo" />}
            onClick={handleUndo}
          >
            {t`Undo`}
          </Button>
        ) : (
          !isLoading && prompt.trim().length > 0 && <Kbd>{"↵"}</Kbd>
        )}
      </Paper>
    </Box>,
    document.body,
  );
}

function getMessage(planState: PlanState, canUndo: boolean): string | null {
  switch (planState.status) {
    case "loading":
      return t`Building your summary…`;
    case "error":
      return planState.message;
    case "applied":
      if (!canUndo) {
        return null;
      }
      return planState.skippedCount > 0
        ? t`Done. Skipped ${planState.skippedCount} part(s) that didn't match this data.`
        : null;
    case "idle":
      return null;
  }
}
