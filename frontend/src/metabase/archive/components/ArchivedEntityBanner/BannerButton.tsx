import type { IconName } from "metabase/ui";
import { Button, Flex, FixedSizeIcon, Text } from "metabase/ui";

interface BannerButtonProps {
  iconName: IconName;
  children: React.ReactNode;
  onClick: () => void;
}

export const BannerButton = ({
  iconName,
  children,
  onClick,
}: BannerButtonProps) => (
  <Button
    compact
    variant="outline"
    color="text-white"
    miw="2rem"
    h="2rem"
    onClick={onClick}
  >
    <Flex align="center" gap="sm">
      <FixedSizeIcon size={12} name={iconName} />
      <Text color="white" display={{ base: "none", sm: "inline" }}>
        {children}
      </Text>
    </Flex>
  </Button>
);
