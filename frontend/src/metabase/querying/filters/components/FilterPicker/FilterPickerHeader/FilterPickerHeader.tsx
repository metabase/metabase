import { Flex, PopoverBackButton } from "metabase/ui";

interface FilterPickerHeaderProps {
  columnName: string;
  children?: React.ReactNode;
  onBack?: () => void;
}

export function FilterPickerHeader({
  columnName,
  children,
  onBack,
}: FilterPickerHeaderProps) {
  return (
    <Flex px="md" pt="md" justify="space-between">
      {onBack && (
        <PopoverBackButton pr="md" onClick={onBack}>
          {columnName}
        </PopoverBackButton>
      )}
      {children}
    </Flex>
  );
}
