import { Flex, Icon, Text, UnstyledButton } from "metabase/ui";

export function DrillButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <UnstyledButton
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Flex gap="xs" align="center">
        <Icon name="zoom_in" c="brand" />
        <Text c="brand">{children}</Text>
      </Flex>
    </UnstyledButton>
  );
}
