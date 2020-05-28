import React from "react";
import { t } from "ttag";

import ClauseStep from "./ClauseStep";

import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";

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
