import type { ReactNode } from "react";

import { Box } from "metabase/ui";

export type MultiAutocompleteOptionProps = {
  value: ReactNode;
  label?: string;
};

export function MultiAutocompleteOption({
  value,
  label,
}: MultiAutocompleteOptionProps) {
  if (label == null) {
    return value;
  }

  return (
    <span>
      <span>{label}</span>
      <Box component="span" mx="xs" opacity={0.5}>
        -
      </Box>
      <Box component="span" opacity={0.5}>
        {value}
      </Box>
    </span>
  );
}
