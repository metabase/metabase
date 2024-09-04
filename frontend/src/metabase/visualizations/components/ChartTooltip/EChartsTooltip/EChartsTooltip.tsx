import cx from "classnames";
import type React from "react";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";

import TooltipStyles from "./EChartsTooltip.module.css";

export interface EChartsTooltipRow {
  /* We pass CSS class with marker colors because setting styles in tooltip rendered by ECharts violates CSP */
  markerColorClass?: string;
  name: string;
  isFocused?: boolean;
  values: React.ReactNode[];
}

export interface EChartsTooltipFooter {
  name: string;
  values: React.ReactNode[];
}

export interface EChartsTooltipModel {
  header?: string;
  rows: EChartsTooltipRow[];
  footer?: EChartsTooltipFooter;
}

export type EChartsTooltipProps = EChartsTooltipModel;

export const EChartsTooltip = ({
  header,
  rows,
  footer,
}: EChartsTooltipProps) => {
  const hasMarkers = rows.some(row => row.markerColorClass != null);
  const maxValuesColumns = rows.reduce((currentMax, row) => {
    return Math.max(currentMax, row.values.filter(isNotNull).length);
  }, 0);

  const paddedRows = rows.map(row => {
    const paddedValues = [...row.values];
    paddedValues.length = maxValuesColumns;

    return {
      ...row,
      values: paddedValues,
    };
  });

  return (
    <div data-testid="echarts-tooltip">
      {header != null && (
        <div
          data-testid="echarts-tooltip-header"
          className={TooltipStyles.Header}
        >
          {header}
        </div>
      )}
      <table
        className={cx(TooltipStyles.Table, {
          [TooltipStyles.TableNoHeader]: header == null,
        })}
      >
        <tbody>
          {paddedRows.map((row, index) => {
            return <TooltipRow key={index} {...row} />;
          })}
        </tbody>
        {footer != null && (
          <tfoot data-testid="echarts-tooltip-footer">
            <FooterRow
              {...footer}
              markerContent={hasMarkers ? <span /> : null}
            />
          </tfoot>
        )}
      </table>
    </div>
  );
};

type TooltipRowProps = EChartsTooltipRow;

const TooltipRow = ({
  name,
  values,
  markerColorClass,
  isFocused,
}: TooltipRowProps) => (
  <BaseRow
    className={cx({ [TooltipStyles.RowFocused]: isFocused })}
    name={name}
    values={values}
    markerContent={
      markerColorClass ? (
        <span className={cx(TooltipStyles.Indicator, markerColorClass)} />
      ) : null
    }
  />
);

const FooterRow = ({
  name,
  values,
  className,
  markerContent,
}: BaseRowProps) => (
  <BaseRow
    className={cx(TooltipStyles.FooterRow, className)}
    name={name}
    values={values}
    markerContent={markerContent}
  />
);

interface BaseRowProps {
  className?: string;
  markerContent?: React.ReactNode;
  name: string;
  values: React.ReactNode[];
}

const BaseRow = ({ className, name, values, markerContent }: BaseRowProps) => (
  <tr className={className}>
    {markerContent != null ? (
      <td className={cx(TooltipStyles.Cell, TooltipStyles.IndicatorCell)}>
        {markerContent}
      </td>
    ) : null}
    {name ? (
      <td className={cx(TooltipStyles.Cell, TooltipStyles.NameCell)}>{name}</td>
    ) : (
      <td className={TooltipStyles.Cell} />
    )}
    {values.map((value, i) => {
      const isMainValue = i === 0;

      return (
        <td
          key={i}
          className={cx(
            TooltipStyles.Cell,
            isMainValue
              ? TooltipStyles.MainValueCell
              : TooltipStyles.SecondaryValueCell,
          )}
        >
          {value}
        </td>
      );
    })}
  </tr>
);
