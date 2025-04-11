import { Box, Flex } from "metabase/ui";

type MultiAutocompleteValueProps = {
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
    <Flex component="span" gap="sm">
      <span>{label}</span>
      <Box opacity={0.5}>{value}</Box>
    </Flex>
  );
}
