import { match } from "ts-pattern";

import type { DraftPart } from "../../editor";
import type { FilterParts } from "../../types";
import { useFilterBarContext } from "../FilterBar/FilterBarContext";
import { OperatorPart } from "../OperatorPart/OperatorPart";
import S from "../PillNodeView/PillNodeView.module.css";
import { PillPart } from "../PillPart/PillPart";
import { PillRange } from "../PillRange/PillRange";

import { PillValues } from "./PillValues";

type PartViewProps = {
  part: DraftPart;
  isEditing?: boolean;
};

export const PartView = ({ part, isEditing = false }: PartViewProps) => {
  const { formatValues } = useFilterBarContext();

  return match(part)
    .with({ type: "column" }, ({ column }) => (
      <PillPart variant="column" part="column">
        {column.label}
      </PillPart>
    ))
    .with({ type: "operator" }, ({ operator }) => (
      <OperatorPart operator={operator} />
    ))
    .with({ type: "values" }, ({ parts, targetStage }) => {
      const format = (values: FilterParts) => formatValues(targetStage, values);
      return match(parts.operator.valueKind)
        .with("none", () => null)
        .with("range", () => <PillRange parts={parts} formatValues={format} />)
        .otherwise((valueKind) =>
          isEditing ? (
            <PillPart variant="value" part="value" isTruncated={false}>
              {format(parts)}
              {valueKind === "multi" && <span className={S.comma}>{", "}</span>}
            </PillPart>
          ) : (
            <PillValues parts={parts} formatValues={format} />
          ),
        );
    })
    .exhaustive();
};
