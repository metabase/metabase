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
      color={color}
      initialAddText={t`Pick a column to group by`}
      items={query.breakouts()}
      tetherOptions={breakoutTetherOptions}
      renderPopover={breakout => (
        <BreakoutPopover
          query={query}
          breakout={breakout}
          onChangeBreakout={newBreakout =>
            breakout
              ? breakout.replace(newBreakout).update(updateQuery)
              : query.breakout(newBreakout).update(updateQuery)
          }
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={breakout => breakout.remove().update(updateQuery)}
    />
  );
}
