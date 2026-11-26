import type { FilterOperator } from "../../types";
import { PillPart } from "../PillPart/PillPart";

import { getOperatorText, isShownAsSymbol } from "./utils";

type OperatorPartProps = {
  operator: FilterOperator;
};

export const OperatorPart = ({ operator }: OperatorPartProps) => (
  <PillPart
    variant={isShownAsSymbol(operator) ? "operatorSymbol" : "operator"}
    part="operator"
  >
    {getOperatorText(operator)}
  </PillPart>
);
