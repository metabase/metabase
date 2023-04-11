import React from "react";
import { t } from "ttag";

import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";

import type { NotebookStepUiComponentProps } from "../types";
import ClauseStep from "./ClauseStep";

const breakoutTetherOptions = {
  attachment: "top left",
  targetAttachment: "bottom left",
  offset: "10px 0",
  constraints: [
    {
      to: "scrollParent",
      attachment: "together",
    },
  ],
};

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
      tetherOptions={breakoutTetherOptions}
      readOnly={readOnly}
      renderPopover={breakout => (
        <BreakoutPopover
          query={query}
          breakout={breakout}
          onChangeBreakout={newBreakout =>
            breakout
              ? updateQuery(breakout.replace(newBreakout))
              : updateQuery(query.breakout(newBreakout))
          }
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={breakout => updateQuery(breakout.remove())}
    />
  );
}

export default BreakoutStep;
