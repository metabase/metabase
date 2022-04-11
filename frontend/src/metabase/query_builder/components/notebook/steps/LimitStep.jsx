/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";

import { NotebookCell } from "../NotebookCell";
import LimitInput from "metabase/query_builder/components/LimitInput";

export default function LimitStep({
  color,
  query,
  updateQuery,
  isLastOpened,
  ...props
}) {
  return (
    <NotebookCell color={color}>
      <LimitInput
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
