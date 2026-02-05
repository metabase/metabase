import { Box, Text, UnstyledButton } from "metabase/ui";

type LensNavigationCardProps = {
  label: string;
  isActive?: boolean;
  onClick: () => void;
};

export const LensNavigationCard = ({
  label,
  isActive = false,
  onClick,
}: LensNavigationCardProps) => (
  <UnstyledButton onClick={onClick} w="100%">
    <Box
      p="sm"
      bdrs="sm"
      bd={isActive ? "1px solid brand" : "1px solid border"}
      style={{ cursor: "pointer" }}
    >
      <Text
        size="sm"
        fw={isActive ? 600 : 400}
        c={isActive ? "brand" : undefined}
      >
        {label}
      </Text>
    </Box>
  </UnstyledButton>
);
