import { type ReactNode, useEffect } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { hasFeature } from "metabase/databases";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { Box, Combobox, Icon, Loader, Text } from "metabase/ui";

import S from "../SummarySidebar.module.css";

import type { FormulaGenerator } from "./use-formula-generator";

export const GENERATE_OPTION_VALUE = "generate";

type GenerateFormulaOptionProps = {
  generator: FormulaGenerator;
  prompt: string;
  /** Shown instead when the user can't use AI or the database can't run the formula. */
  fallback: ReactNode;
  onShow: () => void;
  onAdd: () => void;
};

/**
 * Offers to write a formula for `prompt` with AI. It checks the user's AI permissions only once
 * it's rendered, so a well makes no AI requests until its text matches nothing.
 */
export function GenerateFormulaOption({
  generator,
  prompt,
  fallback,
  onShow,
  onAdd,
}: GenerateFormulaOptionProps) {
  const { canUseNlq } = useUserMetabotPermissions();
  const { databaseId, wellId, state } = generator;
  const { data: database } = useGetDatabaseQuery(
    canUseNlq && databaseId !== null ? { id: databaseId } : skipToken,
  );
  const feature =
    wellId === "values" ? "expression-aggregations" : "expressions";
  const isAvailable = canUseNlq && !!database && hasFeature(database, feature);

  const onShowRef = useLatest(onShow);
  useEffect(() => {
    if (isAvailable) {
      onShowRef.current();
    }
  }, [isAvailable, onShowRef]);

  if (!isAvailable) {
    return fallback;
  }

  const isGenerating = state.status === "loading";
  const errorMessage =
    state.status === "error" && state.prompt === prompt ? state.message : null;
  const hint =
    wellId === "values"
      ? t`Write it as an aggregation with AI`
      : t`Write it as a custom column with AI`;

  const handleClick = async () => {
    if (!isGenerating && (await generator.generate(prompt, database))) {
      onAdd();
    }
  };

  return (
    <Combobox.Option
      value={GENERATE_OPTION_VALUE}
      aria-busy={isGenerating}
      onClick={handleClick}
    >
      {isGenerating ? (
        <Loader size="xs" className={S.searchOptionIcon} />
      ) : (
        <Icon name="sparkles" className={S.searchOptionIcon} aria-hidden />
      )}
      <Box className={S.searchOptionText}>
        <Text fw="bold" lh="inherit" truncate>
          {isGenerating ? t`Generating “${prompt}”…` : t`Generate “${prompt}”`}
        </Text>
        <Text
          size="sm"
          c={errorMessage ? "feedback-negative" : "text-secondary"}
          role={errorMessage ? "alert" : undefined}
        >
          {errorMessage ?? hint}
        </Text>
      </Box>
    </Combobox.Option>
  );
}
