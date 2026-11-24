import { match } from "ts-pattern";
import { t } from "ttag";

import { SYMBOL_OPERATOR_KEYS } from "../../constants";
import type { FilterParts } from "../../types";
import { PillPart } from "../PillPart/PillPart";
import { PillValues } from "../PillValues/PillValues";

type PillPartsProps = {
  parts: FilterParts;
  formatValues: (parts: FilterParts) => string;
};

export const PillParts = ({ parts, formatValues }: PillPartsProps) => {
  const { column, operator, values } = parts;
  const isSymbol = SYMBOL_OPERATOR_KEYS.includes(operator.key);

  return (
    <>
      <PillPart variant="column">{column.label}</PillPart>
      <PillPart variant={isSymbol ? "operatorSymbol" : "operator"}>
        {isSymbol ? operator.key : operator.label}
      </PillPart>
      {match(operator.valueKind)
        .with("none", () => null)
        .with("range", () => (
          <>
            <PillPart variant="value">
              {formatValues({ ...parts, values: values.slice(0, 1) })}
            </PillPart>
            <PillPart variant="operator">{t`and`}</PillPart>
            <PillPart variant="value">
              {formatValues({ ...parts, values: values.slice(1) })}
            </PillPart>
          </>
        ))
        .with("single", "multi", () => (
          <PillValues parts={parts} formatValues={formatValues} />
        ))
        .exhaustive()}
    </>
  );
};
