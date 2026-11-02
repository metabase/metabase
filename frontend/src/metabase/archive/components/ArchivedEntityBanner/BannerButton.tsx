import { Button, FixedSizeIcon, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

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
    size="md"
    variant="on-dark-secondary"
    leftSection={<FixedSizeIcon size={12} name={iconName} />}
    onClick={onClick}
  >
    <Text c="inherit" display={{ base: "none", sm: "inline" }}>
      {children}
    </Text>
  </Button>
);
