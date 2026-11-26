import { t } from "ttag";

import type { FilterParts } from "../../types";
import { PillPart } from "../PillPart/PillPart";

type PillRangeProps = {
  parts: FilterParts;
  formatValues: (parts: FilterParts) => string;
};

export const PillRange = ({ parts, formatValues }: PillRangeProps) => (
  <>
    <PillPart variant="value" part="value">
      {formatValues({ ...parts, values: parts.values.slice(0, 1) })}
    </PillPart>
    <PillPart variant="operator">{t`and`}</PillPart>
    {parts.values.length > 1 && (
      <PillPart variant="value" part="value">
        {formatValues({ ...parts, values: parts.values.slice(1) })}
      </PillPart>
    )}
  </>
);
