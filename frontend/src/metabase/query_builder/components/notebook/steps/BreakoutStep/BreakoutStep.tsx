import React from "react";
import { t } from "ttag";

import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";

import type { NotebookStepUiComponentProps } from "../../types";
import ClauseStep from "../ClauseStep";

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
      items={query.breakouts()}
      initialAddText={t`Pick a column to group by`}
      readOnly={readOnly}
      color={color}
      isLastOpened={isLastOpened}
      tetherOptions={breakoutTetherOptions}
      renderName={item => item.displayName() ?? ""}
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
      onRemove={breakout => updateQuery(breakout.remove())}
      data-testid="breakout-step"
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BreakoutStep;
