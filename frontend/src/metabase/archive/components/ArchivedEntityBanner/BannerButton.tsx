import type { IconName } from "metabase/ui";
import { Button, FixedSizeIcon, Flex, Text } from "metabase/ui";

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
    size="compact-md"
    variant="outline"
    color="text-primary-inverse"
    miw="2rem"
    h="2rem"
    onClick={onClick}
  >
    <Flex align="center" gap="sm">
      <FixedSizeIcon size={12} name={iconName} />
      <Text
        color="text-primary-inverse"
        display={{ base: "none", sm: "inline" }}
      >
        {children}
      </Text>
    </Flex>
  </Button>
);
