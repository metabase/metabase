import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useQuestionFromCardBuilder } from "metabase/metadata-store";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import { getSubpathSafeUrl } from "metabase/urls";
import {
  type VisibleTableData,
  getVisibleTableData,
} from "metabase/visualizations/lib/visible-table-data";
import { isPivoted as _isPivoted, getTitleForColumn } from "metabase/viz-core";
import * as Lib from "metabase-lib";

import { TableInteractive } from "../../components/TableInteractive";
import type { VisualizationProps } from "../../types";

import { TABLE_DEFINITION } from "./definition";
import { SpreadsheetView } from "./spreadsheet/SpreadsheetView";

interface TableProps extends VisualizationProps {
  isShowingDetailsOnlyColumns?: boolean;
}

const SPREADSHEET_MODE_KEY = "metabase-spreadsheet-mode";

function readSpreadsheetMode(): boolean {
  try {
    return sessionStorage.getItem(SPREADSHEET_MODE_KEY) === "1";
  } catch {
    // Private windows and blocked site data throw on access; the plain
    // table is the right fallback.
    return false;
  }
}

function writeSpreadsheetMode(enabled: boolean) {
  try {
    sessionStorage.setItem(SPREADSHEET_MODE_KEY, enabled ? "1" : "0");
  } catch {
    // Not being able to remember the mode is not worth failing a click.
  }
}

function TableComponent(props: TableProps) {
  const { series, settings, isShowingDetailsOnlyColumns, isDashboard } = props;

  // Adding a formula column re-runs the query, which remounts this
  // component and would otherwise drop the user back into the plain table
  // mid-edit. Session storage keeps the mode across that remount; it's
  // per-tab and deliberately not part of the saved question.
  const [isSpreadsheetMode, setIsSpreadsheetMode] =
    useState(readSpreadsheetMode);

  const setSpreadsheetMode = useCallback((enabled: boolean) => {
    setIsSpreadsheetMode(enabled);
    writeSpreadsheetMode(enabled);
  }, []);

  const question = useSyncedQuestion(series);

  const data = useMemo<VisibleTableData>(
    () =>
      getVisibleTableData({ series, settings, isShowingDetailsOnlyColumns }),
    [series, settings, isShowingDetailsOnlyColumns],
  );

  const getColumnTitle = useCallback(
    (columnIndex: number) =>
      getTitleForColumn(data.cols[columnIndex], series, settings),
    [data, series, settings],
  );

  const getColumnSortDirection = useCallback(
    (columnIndex: number) => {
      const query = question.query();
      const stageIndex = -1;
      const column = Lib.findMatchingColumn(
        query,
        stageIndex,
        Lib.fromLegacyColumn(query, stageIndex, data.cols[columnIndex]),
        Lib.orderableColumns(query, stageIndex),
      );

      if (column != null) {
        const columnInfo = Lib.displayInfo(query, stageIndex, column);
        if (columnInfo.orderByPosition != null) {
          const orderBys = Lib.orderBys(query, stageIndex);
          const orderBy = orderBys[columnInfo.orderByPosition];
          const orderByInfo = Lib.displayInfo(query, stageIndex, orderBy);
          return orderByInfo.direction;
        }
      }
    },
    [question, data],
  );

  const isPivoted = _isPivoted(series, settings);
  const areAllColumnsHidden = data.cols.length === 0;

  if (areAllColumnsHidden) {
    return <AllFieldsHiddenMessage isDashboard={isDashboard} />;
  }

  if (isSpreadsheetMode) {
    // Same flex-fill classes TableInteractive gets for free via
    // `props.className` (see the non-spreadsheet branch below) —
    // SpreadsheetView isn't TableInteractive, so it needs them applied
    // explicitly. flexBasisNone specifically (flex-basis: 0) is what lets
    // this shrink *below* its own content size instead of just growing;
    // without it the element only grows (flex: 1 0 auto), overflows its
    // real ancestor, and gets silently clipped by an `overflow: hidden`
    // further up rather than scrolling internally.
    return (
      <SpreadsheetView
        data={data}
        onExit={() => setSpreadsheetMode(false)}
        className={cx(CS.flex, CS.flexColumn, CS.flexFull, CS.flexBasisNone)}
        question={question}
        onChangeCardAndRun={props.onChangeCardAndRun}
      />
    );
  }

  return (
    // Deliberately not wrapping TableInteractive in a new element:
    // TableInteractive's own root div depends on being a direct flex
    // child of its real ancestor (it carries flex-fill CSS classes
    // passed down via `className`) to get a non-zero height. Any
    // wrapping block-level element here breaks that flex chain and
    // silently renders TableInteractive as blank (its own
    // `if (!width || !height) return <div ... />` guard). The toggle
    // button instead anchors, via position:absolute, to the nearest
    // already-positioned ancestor further up the tree.
    <>
      {!isDashboard && !isPivoted && (
        <Tooltip label={t`Try spreadsheet view (preview)`}>
          <ActionIcon
            pos="absolute"
            top={8}
            // Metabase's own "Add column" (+) button sits flush at the
            // real top-right corner of the header row (36px wide, see
            // AddColumnButton.module.css) — offset past it rather than
            // covering it.
            right={52}
            // TableInteractive's sticky column headers get compositor-
            // promoted above ordinary z-indexed siblings in practice, so
            // this needs real headroom, not just "higher than its static
            // root's z-index:auto".
            style={{ zIndex: 1000 }}
            variant="default"
            aria-label={t`Spreadsheet view`}
            onClick={() => setSpreadsheetMode(true)}
          >
            <Icon name="function" size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      <TableInteractive
        {...props}
        question={question}
        data={data}
        isPivoted={isPivoted}
        getColumnTitle={getColumnTitle}
        getColumnSortDirection={getColumnSortDirection}
      />
    </>
  );
}

/*
 * Constructs a Question that is in-sync with query results.
 * Reads metadata through a ref so async metadata updates don't recreate the
 * question (and rebuild every column) mid-interaction; series changes on every
 * query run, which is when fresh metadata actually needs to be picked up.
 */
function useSyncedQuestion(series: VisualizationProps["series"]) {
  const buildQuestionRef = useLatest(useQuestionFromCardBuilder());
  return useMemo(() => {
    const [{ card }] = series;
    return buildQuestionRef.current(card);
  }, [series, buildQuestionRef]);
}

function AllFieldsHiddenMessage({ isDashboard }: { isDashboard: boolean }) {
  const allFieldsHiddenImageUrl = getSubpathSafeUrl(
    "app/assets/img/hidden-field.png",
  );
  const allFieldsHiddenImage2xUrl = getSubpathSafeUrl(
    "app/assets/img/hidden-field@2x.png",
  );

  return (
    <div
      className={cx(
        CS.flexFull,
        CS.px1,
        CS.pb1,
        CS.textCentered,
        CS.flex,
        CS.flexColumn,
        CS.layoutCentered,
        { [CS.textSlateLight]: isDashboard, [CS.textSlate]: !isDashboard },
      )}
    >
      <img
        data-testid="Table-all-fields-hidden-image"
        width={99}
        src={allFieldsHiddenImageUrl}
        srcSet={`
          ${allFieldsHiddenImageUrl}   1x,
          ${allFieldsHiddenImage2xUrl} 2x
        `}
        className={CS.mb2}
      />
      <span
        className={cx(CS.h4, CS.textBold)}
      >{t`Every field is hidden right now`}</span>
    </div>
  );
}

export const Table = Object.assign(TableComponent, TABLE_DEFINITION);
