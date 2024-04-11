import cx from "classnames";
import { getIn } from "icepick";
import PropTypes from "prop-types";

import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { formatColumn, formatValue } from "metabase/lib/formatting";
import type { Dataset, DatasetColumn, RowValues } from "metabase-types/api";

import { columnNameToUrl } from "../audit_app/lib/mode";

const idxToUrl = ({
  resRow,
  nameToResCol,
  colName,
}: {
  resRow: RowValues;
  nameToResCol: Record<string, number>;
  colName: string | null;
}) => {
  const idVal = resRow[nameToResCol[colName]];
  const urlVal = colName && idVal ? columnNameToUrl[colName](idVal) : "";
  const linkClass = urlVal === "" ? "" : "text-brand";
  return [urlVal, linkClass];
};

export const ErrorDetailDisplay = ({ result }: { result: Dataset }) => {
  const resRow = getIn(result, ["data", "rows", 0]);
  const resCols = getIn(result, ["data", "cols"]);
  if (resRow && resCols) {
    const nameToResCol = resCols.reduce(
      (obj: Record<string, number>, x: DatasetColumn, idx: number) =>
        Object.assign(obj, { [x.name]: idx }),
      {},
    );

    const linkColumns = [
      null,
      "collection_id",
      "database_id",
      null,
      "table_id",
      null,
      "user_id",
      null,
    ];

    const ordinaryRows = [
      "last_run_at",
      "collection_name",
      "database_name",
      "schema_name",
      "table_name",
      "total_runs",
      "user_name",
      "updated_at",
    ].map((x, idx) => {
      const [urlVal, linkClass] = idxToUrl({
        resRow,
        nameToResCol,
        colName: linkColumns[idx],
      });
      const formattedVal = formatValue(resRow[nameToResCol[x]], {
        column: resCols[nameToResCol[x]],
        jsx: true,
        rich: true,
        type: "cell",
        local: true,
      });
      return (
        <tr key={x}>
          <td align="right" className={cx(CS.m0, CS.mt1, CS.textMedium)}>
            {formatColumn(resCols[nameToResCol[x]])}
          </td>
          <td>
            {
              <Link to={urlVal} className={linkClass}>
                link: {formattedVal}
              </Link>
            }
          </td>
        </tr>
      );
    });

    const dashIdRows = resRow[nameToResCol.dash_name_str]
      ?.split("|")
      ?.map((x: string, idx: number) => (
        <tr key={x}>
          <td align="right" className={cx(CS.m0, CS.mt1, CS.textMedium)}>
            {idx === 0 && formatColumn(resCols[nameToResCol.dash_name_str])}
          </td>
          <td className={CS.textBold}>
            {formatValue(x, { column: resCols[nameToResCol.dash_name_str] })}
          </td>
        </tr>
      ));

    const [cardUrlVal, cardLinkClass] = idxToUrl({
      resRow,
      nameToResCol,
      colName: "card_id",
    });

    return (
      <>
        <h2 className={cx(CS.m0, CS.py2)} key="card_name">
          {
            <Link to={cardUrlVal} className={cardLinkClass}>
              {resRow[nameToResCol.card_name]}
            </Link>
          }
        </h2>
        <div
          key="error_str"
          className={cx(
            CS.half,
            CS.rounded,
            CS.p2,
            CS.textDark,
            CS.textMonospace,
            CS.textSmall,
            "bg-light",
          )}
        >
          {resRow[nameToResCol.error_str]}
        </div>
        <table key="table" className={cx("half", AdminS.ContentTable, CS.mt4)}>
          <tbody>{[ordinaryRows, dashIdRows]}</tbody>
        </table>
      </>
    );
  } else {
    return null;
  }
};
