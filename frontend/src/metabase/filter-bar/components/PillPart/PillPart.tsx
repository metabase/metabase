import cx from "classnames";
import type { ReactNode } from "react";

import { Ellipsified, type TextProps } from "metabase/ui";

import S from "./PillPart.module.css";

type PillPartVariant =
  | "column"
  | "operator"
  | "operatorSymbol"
  | "value"
  | "expression";

const VARIANT_PROPS: Record<PillPartVariant, TextProps> = {
  column: { c: "text-primary", fw: "bold", maw: "13.875rem" },
  operator: { c: "text-secondary" },
  operatorSymbol: { c: "text-secondary", ff: "monospace" },
  value: { c: "core-filter-strong", fw: "bold", maw: "12.1875rem" },
  expression: { c: "text-primary", ff: "monospace", fw: 500 },
};

type PillPartProps = {
  variant: PillPartVariant;
  tooltip?: ReactNode;
  alwaysShowTooltip?: boolean;
  children: ReactNode;
};

export const PillPart = ({
  variant,
  tooltip,
  alwaysShowTooltip,
  children,
}: PillPartProps) => (
  <Ellipsified
    className={cx(S.part, { [S.column]: variant === "column" })}
    span
    px="xxs"
    py="xxxs"
    fz="sm"
    lh={1.15}
    tooltip={tooltip}
    alwaysShowTooltip={alwaysShowTooltip}
    tooltipProps={{ multiline: true, maw: "20rem" }}
    {...VARIANT_PROPS[variant]}
  >
    {children}
  </Ellipsified>
);
