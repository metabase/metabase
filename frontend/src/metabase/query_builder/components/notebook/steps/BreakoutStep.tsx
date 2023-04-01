import React from "react";
import { t } from "ttag";

import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";

import type { NotebookStepUiComponentProps } from "../types";
import ClauseStep from "./ClauseStep";

function BreakoutStep({
  color,
  query,
  updateQuery,
  isLastOpened,
  readOnly,
}: NotebookStepUiComponentProps) {
  return (
    <ClauseStep
      data-testid="breakout-step"
      color={color}
      initialAddText={t`Pick a column to group by`}
      items={query.breakouts()}
      renderName={item => item.displayName() ?? ""}
      readOnly={readOnly}
      renderPopover={({ item: breakout, closePopover }) => (
        <BreakoutPopover
          query={query}
          breakout={breakout}
          onChangeBreakout={newBreakout => {
            if (breakout) {
              updateQuery(breakout.replace(newBreakout));
            } else {
              updateQuery(query.breakout(newBreakout));
            }
            closePopover();
          }}
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={breakout => updateQuery(breakout.remove())}
    />
  );
}

export default BreakoutStep;
