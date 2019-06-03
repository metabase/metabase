import React from "react";

import Input from "metabase/components/Input";
import Icon from "metabase/components/Icon";
import { Flex } from "grid-styled";

export default function LimitStep({
  color,
  query,
  updateQuery,
  isLastOpened,
  ...props
}) {
  return (
    <Flex align="center">
      <Input
        small
        type="number"
        value={query.limit() == null ? "" : query.limit()}
        placeholder="Enter a limit"
        onChange={e => {
          const limit = parseInt(e.target.value, 0);
          if (limit >= 1) {
            query.updateLimit(limit).update(updateQuery);
          }
        }}
      />
      {query.limit() != null && (
        <Icon
          name="close"
          onClick={() => query.clearLimit().update(updateQuery)}
          className="ml2 text-light text-medium-hover cursor-pointer"
        />
      )}
    </Flex>
  );
}
