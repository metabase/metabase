import { DateTime } from "metabase/common/components/DateTime";
import { Tooltip } from "metabase/ui";
import { isa } from "metabase-lib/v1/types/utils/isa";

type CheckpointValueProps = {
  value: string;
  baseType?: string;
};

/**
 * Strip Java's ZonedDateTime bracket suffix (e.g. `[UTC]`, `[Asia/Kolkata]`)
 * which isn't parseable by JS Date. The numeric offset in the ISO portion
 * (e.g. `Z`, `+05:30`) is preserved and sufficient.
 */
function stripBracketZone(value: string): string {
  const idx = value.indexOf("[");
  return idx >= 0 ? value.slice(0, idx) : value;
}

export function CheckpointValue({ value, baseType }: CheckpointValueProps) {
  if (baseType && isa(baseType, "type/Temporal")) {
    const cleanValue = stripBracketZone(value);
    return (
      <Tooltip label={cleanValue}>
        <DateTime value={cleanValue} unit="minute" />
      </Tooltip>
    );
  }

  return <>{value}</>;
}
