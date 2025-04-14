import { Box } from "metabase/ui";

export type MultiAutocompleteValueProps = {
  value: string;
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
      <span>{value}</span>
      <Box component="span" mx="xs" opacity={0.5}>
        -
      </Box>
      <span>{label}</span>
    </span>
  );
}
