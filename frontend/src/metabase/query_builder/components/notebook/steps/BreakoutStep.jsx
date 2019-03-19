import React from "react";

import ClauseStep from "./ClauseStep";

import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";

export default function BreakoutStep({ color, query, ...props }) {
  return (
    <ClauseStep
      color={color}
      items={query.breakouts()}
      renderPopover={breakout => (
        <BreakoutPopover
          query={query}
          breakout={breakout}
          onChangeBreakout={newBreakout =>
            breakout
              ? breakout.replace(newBreakout).update()
              : query.addBreakout(newBreakout).update()
          }
        />
      )}
      onRemove={breakout => breakout.remove().update()}
    />
  );
}
