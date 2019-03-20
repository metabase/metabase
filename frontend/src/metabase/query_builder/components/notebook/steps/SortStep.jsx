import React from "react";

import ClauseStep from "./ClauseStep";

export default function SortStep({ color, query, isLastOpened, ...props }) {
  return (
    <ClauseStep
      color={color}
      items={query.sorts()}
      renderPopover={sort => <div>NYI</div>}
      isLastOpened={isLastOpened}
      onRemove={sort => sort.remove().update()}
    />
  );
}
