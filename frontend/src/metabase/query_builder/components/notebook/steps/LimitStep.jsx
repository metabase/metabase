import React from "react";

import { t } from "ttag";

import Input from "metabase/components/Input";

import { NotebookCell } from "../NotebookCell";

export default function LimitStep({
  color,
  query,
  updateQuery,
  isLastOpened,
  ...props
}) {
  return (
    <NotebookCell color={color}>
      <Input
        small
        className="mb1"
        type="number"
        value={query.limit() == null ? "" : query.limit()}
        placeholder={t`Enter a limit`}
        onChange={e => {
          const limit = parseInt(e.target.value, 0);
          if (limit >= 1) {
            query.updateLimit(limit).update(updateQuery);
          }
        }}
      />
    </NotebookCell>
  );
}
