import { useRef, useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useLazyGetCardQueryQuery } from "metabase/api";
import CS from "metabase/css/core/index.css";
import { fetchDataOrError } from "metabase/dashboard/utils";
import AuditParameters from "metabase-enterprise/audit_app/components/AuditParameters";
import AuditTable from "metabase-enterprise/audit_app/containers/AuditTable";
import * as Queries from "metabase-enterprise/audit_app/lib/cards/queries";

import { ErrorMode } from "./mode";

type Sorting = {
  column: string;
  isAscending: boolean;
};

type AuditFilters = {
  errorFilter: string;
  dbFilter: string;
  collectionFilter: string;
};

type AllSelectEvent = {
  rows: unknown[][];
};

type RowSelectEvent = {
  row: unknown[];
};

type AuditResult = { row_count: number }[];

const getSortOrder = (isAscending: boolean) => (isAscending ? "asc" : "desc");

const CARD_ID_COL = 0;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function ErrorOverview(props: Record<string, unknown>) {
  const [runCardQuery] = useLazyGetCardQueryQuery();
  const reloadRef = useRef<(() => void) | null>(null);
  // TODO: use isReloading to display a loading overlay
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isReloading, setIsReloading] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [sorting, setSorting] = useState<Sorting>({
    column: "last_run_at",
    isAscending: false,
  });

  const [rowChecked, setRowChecked] = useState<Record<string, boolean>>({});

  const handleAllSelectClick = (e: AllSelectEvent) => {
    const newRowChecked = { ...rowChecked };
    const noRowChecked = Object.values(rowChecked).every((v) => !v);
    for (const row of e.rows) {
      const cardIndex = String(row[CARD_ID_COL]);
      newRowChecked[cardIndex] = noRowChecked;
    }
    setRowChecked(newRowChecked);
  };

  const handleRowSelectClick = (e: RowSelectEvent) => {
    const newRowChecked = { ...rowChecked };
    const cardIndex = String(e.row[CARD_ID_COL]);
    newRowChecked[cardIndex] = !rowChecked[cardIndex];
    setRowChecked(newRowChecked);
  };

  const handleReloadSelected = async () => {
    const checkedCardIds = Object.keys(rowChecked).filter(
      (id) => rowChecked[id],
    );

    await Promise.all(
      checkedCardIds.map((member) =>
        fetchDataOrError(runCardQuery({ cardId: Number(member) }).unwrap()),
      ),
    );
    setRowChecked({});
    setIsReloading(true);
    reloadRef.current?.();
  };

  const handleSortingChange = (sorting: Sorting) => setSorting(sorting);

  const handleLoad = (result: AuditResult) => {
    setHasResults(result[0].row_count !== 0);
    setIsReloading(false);
  };

  return (
    <SettingsPageWrapper title={t`Questions that errored when last run`}>
      <SettingsSection>
        <AuditParameters
          parameters={[
            { key: "errorFilter", placeholder: t`Error contents` },
            { key: "dbFilter", placeholder: t`DB name` },
            { key: "collectionFilter", placeholder: t`Collection name` },
          ]}
          buttons={[
            {
              key: "reloadSelected",
              label: t`Rerun Selected`,
              disabled: Object.values(rowChecked).every(
                (isChecked) => !isChecked,
              ),
              onClick: handleReloadSelected,
            },
          ]}
          hasResults={hasResults}
        >
          {({ errorFilter, dbFilter, collectionFilter }: AuditFilters) => (
            <AuditTable
              {...props}
              reloadRef={reloadRef}
              pageSize={50}
              isSortable
              isSelectable
              rowChecked={rowChecked}
              sorting={sorting}
              onSortingChange={handleSortingChange}
              onAllSelectClick={handleAllSelectClick}
              onRowSelectClick={handleRowSelectClick}
              onLoad={handleLoad}
              mode={ErrorMode}
              table={Queries.bad_table(
                errorFilter,
                dbFilter,
                collectionFilter,
                sorting.column,
                getSortOrder(sorting.isAscending),
              )}
              className={CS.mt2}
            />
          )}
        </AuditParameters>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
