import { Box, Flex } from "metabase/ui";

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
    <Flex flex={1} justify="space-between" gap="sm">
      <span>{label}</span>
      <Box opacity={0.5}>{value}</Box>
    </Flex>
  );
}
