import { t } from "ttag";

import {
  SCD_PROTOTYPE_VARIANTS,
  type ScdPrototypeVariant,
  useChangingAttributes,
} from "metabase/metadata/table-structure";
import { Paper, Select } from "metabase/ui";

const VARIANT_LABELS: Record<ScdPrototypeVariant, string> = {
  attribute: "A · Rows on the attribute",
  relationship: "B · On the foreign key",
  form: "C · Form on the attribute",
  group: "D · Group in the field list",
  "group-flat": "D2 · Same, one more row instead of groups",
  behavior: "D3 · How the attribute changes",
  sentence: "E · One sentence on the history table",
  columns: "F · Two columns, people pick",
  measure: "G · On the measure",
};

/** PROTOTYPE: switches between the history-table prototypes */
export function ScdVariantSwitcher() {
  const { variant, setVariant } = useChangingAttributes();
  return (
    <Paper
      pos="fixed"
      bottom={16}
      right={16}
      p="xs"
      shadow="md"
      withBorder
      style={{ zIndex: 100 }}
    >
      <Select
        aria-label={t`History prototype`}
        size="xs"
        w={280}
        data={SCD_PROTOTYPE_VARIANTS.map((value) => ({
          value,
          label: VARIANT_LABELS[value],
        }))}
        value={variant}
        onChange={(value) => {
          const next = SCD_PROTOTYPE_VARIANTS.find(
            (option) => option === value,
          );
          if (next) {
            setVariant(next);
          }
        }}
      />
    </Paper>
  );
}
