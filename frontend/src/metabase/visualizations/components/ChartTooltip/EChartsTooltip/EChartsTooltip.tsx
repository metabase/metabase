import cx from "classnames";
import type React from "react";

import TooltipStyles from "./EChartsTooltip.module.css";

export interface EChartsTooltipRow {
  /* We pass CSS class with marker colors because setting styles in tooltip rendered by ECharts violates CSP */
  markerColorClass?: string;
  name: string;
  isFocused?: boolean;
  values: React.ReactNode[];
}

export interface EChartsTooltipFooter {
  markerSymbol: string;
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
  return (
    <div>
      {header != null && <div className={TooltipStyles.Header}>{header}</div>}
      <table
        className={cx(TooltipStyles.Table, {
          [TooltipStyles.TableNoHeader]: header == null,
        })}
      >
        <tbody>
          {rows.map((row, index) => (
            <TooltipRow key={index} {...row} />
          ))}
        </tbody>
        {footer != null && (
          <tfoot>
            <FooterRow {...footer} />
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

type FooterRowProps = EChartsTooltipFooter;

const FooterRow = ({ name, values, markerSymbol }: FooterRowProps) => (
  <BaseRow
    className={TooltipStyles.FooterRow}
    name={name}
    values={values}
    markerContent={markerSymbol}
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
