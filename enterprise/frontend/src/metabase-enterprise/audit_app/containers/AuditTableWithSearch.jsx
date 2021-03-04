import React from "react";

import AuditTable from "./AuditTable";
import AuditParameters from "../components/AuditParameters";

import { t } from "ttag";
import { updateIn } from "icepick";

import type { AuditDashCard } from "../types";

type Props = {
  placeholder?: string,
  table: AuditDashCard,
};

// AuditTable but with a default search parameter that gets appended to `args`
const AuditTableWithSearch = ({
  placeholder = t`Search`,
  table,
  ...props
}: Props) => (
  <AuditParameters parameters={[{ key: "search", placeholder }]}>
    {({ search }) => (
      <AuditTable
        {...props}
        table={
          search
            ? updateIn(table, ["card", "dataset_query", "args"], args =>
                (args || []).concat(search),
              )
            : table
        }
      />
    )}
  </AuditParameters>
);

export default AuditTableWithSearch;
