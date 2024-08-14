import cx from "classnames";
import type React from "react";
import _ from "underscore";

import TooltipStyles from "./EChartsTooltip.module.css";

export interface EChartsTooltipRow {
  /* We pass CSS class with marker colors because setting styles in tooltip rendered by ECharts violates CSP */
  markerColorClass?: string;
  name: string;
  isFocused?: boolean;
  values: React.ReactNode[];
}

export interface EChartsTooltipFooter {
  markerSymbol?: string;
  name: string;
  values: React.ReactNode[];
}

export interface EChartsTooltipModel {
  header?: string;
  rows: EChartsTooltipRow[];
  footer?: EChartsTooltipFooter;
  showMarkers?: boolean;
}

export type EChartsTooltipProps = EChartsTooltipModel;

export const EChartsTooltip = ({
  header,
  rows,
  footer,
  showMarkers = true,
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
          {rows.map((row, index) => {
            return (
              <TooltipRow
                key={index}
                {...(showMarkers ? row : _.omit(row, "markerColorClass"))}
              />
            );
          })}
        </tbody>
        {footer != null && (
          <tfoot>
            <FooterRow
              {...(showMarkers ? footer : _.omit(footer, "markerSymbol"))}
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

      if (!isMainValue && value == null) {
        return null;
      }

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
