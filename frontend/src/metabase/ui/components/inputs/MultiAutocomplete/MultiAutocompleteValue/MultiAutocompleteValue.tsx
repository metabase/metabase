import type { ReactNode } from "react-markdown/lib/react-markdown";

import { Box } from "metabase/ui";

export type MultiAutocompleteValueProps = {
  value: ReactNode;
  label?: string;
};

export function MultiAutocompleteValue({
  value,
  label,
}: MultiAutocompleteValueProps) {
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
