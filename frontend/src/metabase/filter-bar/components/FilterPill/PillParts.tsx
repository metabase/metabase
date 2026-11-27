import { match } from "ts-pattern";

import type { FilterParts } from "../../types";
import { OperatorPart } from "../OperatorPart/OperatorPart";
import { PillPart } from "../PillPart/PillPart";
import { PillRange } from "../PillRange/PillRange";

import { PillValues } from "./PillValues";

type PillPartsProps = {
  parts: FilterParts;
  formatValues: (parts: FilterParts) => string;
};

export const PillParts = ({ parts, formatValues }: PillPartsProps) => {
  const { column, operator } = parts;

  return (
    <>
      <PillPart variant="column" part="column">
        {column.label}
      </PillPart>
      <OperatorPart operator={operator} />
      {match(operator.valueKind)
        .with("none", () => null)
        .with("range", () => (
          <PillRange parts={parts} formatValues={formatValues} />
        ))
        .with("single", "multi", () => (
          <PillValues parts={parts} formatValues={formatValues} />
        ))
        .exhaustive()}
    </>
  );
};
