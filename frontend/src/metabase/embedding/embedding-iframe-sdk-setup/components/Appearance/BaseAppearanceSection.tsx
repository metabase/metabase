import type { PropsWithChildren, ReactNode } from "react";
import { t } from "ttag";

import { Flex, Group, Text } from "metabase/ui";

type Props = {
  icons?: ReactNode;
};

export const BaseAppearanceSection = ({
  children,
  icons,
}: PropsWithChildren<Props>) => {
  return (
    <>
      <Group
        justify="space-between"
        align="center"
        mb="lg"
        data-testid="appearance-section"
      >
        <Text size="lg" fw="bold">
          {t`Appearance`}
        </Text>

        <Flex gap="md" align="center">
          {icons}
        </Flex>
      </Group>

      <Group align="start" gap="xl">
        {children}
      </Group>
    </>
  );
};
