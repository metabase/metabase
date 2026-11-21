import { type ReactNode, useEffect } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { Box, Combobox, Icon, Kbd, Loader, Text } from "metabase/ui";

import type { SummaryFormulaAccess } from "../SummaryFormulaGenerator";
import S from "../SummarySidebar.module.css";
import type { SummaryWellId } from "../types";

export const GENERATE_OPTION_VALUE = "generate";

export type GenerateFormulaState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

type GenerateFormulaOptionProps = {
  wellId: SummaryWellId;
  prompt: string;
  state: GenerateFormulaState;
  access: SummaryFormulaAccess;
  fallback: ReactNode;
  onShow: () => void;
};

/** Offers to write a formula for `prompt` with AI, or shows `fallback` when the user can't use AI. */
export function GenerateFormulaOption({
  wellId,
  prompt,
  state,
  access,
  fallback,
  onShow,
}: GenerateFormulaOptionProps) {
  const isAvailable = access === "available";
  const onShowRef = useLatest(onShow);
  useEffect(() => {
    if (isAvailable) {
      onShowRef.current();
    }
  }, [isAvailable, onShowRef]);

  if (access === "loading") {
    return (
      <Combobox.Empty>
        <Loader size="xs" aria-label={t`Loading…`} />
      </Combobox.Empty>
    );
  }
  if (!isAvailable) {
    return fallback;
  }

  const isGenerating = state.status === "loading";
  const errorMessage = state.status === "error" ? state.message : null;
  const hint =
    wellId === "values"
      ? t`Write it as an aggregation with AI`
      : t`Write it as a custom column with AI`;

  return (
    <Combobox.Group label={t`AI`}>
      <Combobox.Option
        value={GENERATE_OPTION_VALUE}
        disabled={isGenerating}
        aria-busy={isGenerating}
        className={S.generateOption}
      >
        {isGenerating ? (
          <Loader size="xs" className={S.searchOptionIcon} />
        ) : (
          <Icon name="sparkles" className={S.searchOptionIcon} aria-hidden />
        )}
        <Box className={S.searchOptionText}>
          <Text className={S.generateOptionLabel}>
            {isGenerating
              ? t`Generating “${prompt}”…`
              : t`Generate “${prompt}”`}
          </Text>
          <Text
            className={S.searchOptionDescription}
            role={errorMessage ? "alert" : undefined}
          >
            {errorMessage ?? hint}
          </Text>
        </Box>
        {!isGenerating && <Kbd>{"↵"}</Kbd>}
      </Combobox.Option>
    </Combobox.Group>
  );
}
