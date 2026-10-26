import { useState } from "react";
import { t } from "ttag";

import { Box, Switch } from "metabase/ui";

import type { FilterCanvasProps } from "../../types";
import { ExpressionBarSplitPrototype } from "../expression-bar-unified/ExpressionBarPrototype";

import { QuestionChart } from "./QuestionChart";
import {
  LandedFlash,
  QuestionShell,
  useQuestionHistory,
} from "./QuestionShell";

/**
 * Today's layout (the rows bar with summary pills from iteration 3), with the
 * chart's click menu rebuilt: values in every label, no operators on a bar.
 */
export function DrillMenuCanvas({
  query,
  onChange,
  heading,
}: FilterCanvasProps) {
  const question = useQuestionHistory(query, onChange);
  const [hasNewMenu, setHasNewMenu] = useState(true);

  return (
    <QuestionShell
      query={query}
      heading={heading}
      canGoBack={question.canGoBack}
      onBack={question.back}
      settings={
        <Switch
          label={t`New click menu`}
          checked={hasNewMenu}
          onChange={(event) => setHasNewMenu(event.currentTarget.checked)}
        />
      }
    >
      <Box
        pos="relative"
        style={{ borderTop: "1px solid var(--mb-color-border-neutral)" }}
      >
        <LandedFlash landedKey={question.landedKey} />
        <ExpressionBarSplitPrototype
          query={query}
          stageIndex={0}
          variant="chill"
          onChange={onChange}
        />
      </Box>
      <Box p="lg">
        <QuestionChart
          query={query}
          display="bar"
          hasNewMenu={hasNewMenu}
          onPick={question.apply}
          onLegacyDrill={(nextQuery) => question.apply(nextQuery)}
        />
      </Box>
    </QuestionShell>
  );
}
