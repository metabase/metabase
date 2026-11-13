import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import { Flex, Icon, Text } from "metabase/ui";

import S from "./WarningBanner.module.css";

type WarningBannerProps = {
  message: React.ReactNode;
  rightContent?: React.ReactNode;
  "data-test-id"?: string;
};

export function WarningBanner({
  message,
  rightContent,
  "data-test-id": dataTestId,
}: WarningBannerProps) {
  const isSmallScreen = useIsSmallScreen();

  return (
    <Flex
      className={S.root}
      gap="lg"
      wrap="nowrap"
      data-testid={dataTestId}
      direction={isSmallScreen ? "column" : "row"}
    >
      <Flex gap="lg" align="center">
        <Icon name="warning" className={S.icon} />
        <Text fw="bold" size="md" className={S.text}>
          {message}
        </Text>
      </Flex>
      {rightContent}
    </Flex>
  );
}
