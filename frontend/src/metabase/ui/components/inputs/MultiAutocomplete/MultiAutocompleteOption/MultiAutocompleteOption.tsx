import { Box } from "metabase/ui";

export type MultiAutocompleteOptionProps = {
  value: string;
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
      <span>{value}</span>
      <Box component="span" mx="xs" opacity={0.5}>
        -
      </Box>
      <span>{label}</span>
    </span>
  );
}
