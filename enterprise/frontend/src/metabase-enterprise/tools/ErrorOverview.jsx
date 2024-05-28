import { useState, useRef } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { CardApi } from "metabase/services";

import AuditParameters from "../audit_app/components/AuditParameters";
import AuditTable from "../audit_app/containers/AuditTable";
import * as Queries from "../audit_app/lib/cards/queries";

import { ErrorMode } from "./mode";

const getSortOrder = isAscending => (isAscending ? "asc" : "desc");

const CARD_ID_COL = 0;

export default function ErrorOverview(props) {
  const reloadRef = useRef(null);
  // TODO: use isReloading to display a loading overlay
  // eslint-disable-next-line no-unused-vars
  const [isReloading, setIsReloading] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [sorting, setSorting] = useState({
    column: "last_run_at",
    isAscending: false,
  });

  const [rowChecked, setRowChecked] = useState({});

  const handleAllSelectClick = e => {
    const newRowChecked = { ...rowChecked };
    const noRowChecked = Object.values(rowChecked).every(v => !v);
    for (const rowIndex of Array(e.rows.length).keys()) {
      const cardIndex = e.rows[rowIndex][CARD_ID_COL];
      if (noRowChecked) {
        newRowChecked[cardIndex] = true;
      } else {
        newRowChecked[cardIndex] = false;
      }
    }
    setRowChecked(newRowChecked);
  };

  const handleRowSelectClick = e => {
    const newRowChecked = { ...rowChecked };
    const cardIndex = e.row[CARD_ID_COL];
    newRowChecked[cardIndex] = !(rowChecked[cardIndex] || false);
    setRowChecked(newRowChecked);
  };

  const handleReloadSelected = async () => {
    const checkedCardIds = Object.keys(_.pick(rowChecked, _.identity));

    await Promise.all(
      checkedCardIds.map(
        async member => await CardApi.query({ cardId: member }),
      ),
    );
    setRowChecked({});
    setIsReloading(true);
    reloadRef.current?.();
  };

  const handleSortingChange = sorting => setSorting(sorting);

  const handleLoad = result => {
    setHasResults(result[0].row_count !== 0);
    setIsReloading(false);
  };

  return (
    <>
      <h2>{t`Questions that errored when last run`}</h2>
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
            disabled: Object.values(rowChecked).every(isChecked => !isChecked),
            onClick: handleReloadSelected,
          },
        ]}
        hasResults={hasResults}
      >
        {({ errorFilter, dbFilter, collectionFilter }) => (
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
    </>
  );
}
