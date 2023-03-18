/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";
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

export default function BreakoutStep({
  color,
  query,
  updateQuery,
  isLastOpened,
  ...props
}) {
  return (
    <ClauseStep
      data-testid="breakout-step"
      color={color}
      initialAddText={t`Pick a column to group by`}
      items={query.breakouts()}
      renderName={item => item.displayName()}
      tetherOptions={breakoutTetherOptions}
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
