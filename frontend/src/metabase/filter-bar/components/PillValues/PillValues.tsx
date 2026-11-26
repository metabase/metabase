import type { FilterParts } from "../../types";
import { PillPart } from "../PillPart/PillPart";

import S from "./PillValues.module.css";

const MAX_SHOWN_VALUES = 3;

type PillValuesProps = {
  parts: FilterParts;
  formatValues: (parts: FilterParts) => string;
};

export const PillValues = ({ parts, formatValues }: PillValuesProps) => {
  const shownValues = parts.values.slice(0, MAX_SHOWN_VALUES);
  const hiddenCount = parts.values.length - shownValues.length;
  const shownText = formatValues({ ...parts, values: shownValues });

  return (
    <>
      <PillPart
        variant="value"
        part="value"
        tooltip={formatValues(parts)}
        alwaysShowTooltip={hiddenCount > 0}
      >
        {hiddenCount > 0 ? `${shownText}, ...` : shownText}
      </PillPart>
      {hiddenCount > 0 && (
        <span className={S.moreValues}>{`+${hiddenCount}`}</span>
      )}
    </>
  );
};
