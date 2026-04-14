import type { PropsWithChildren, ReactNode } from "react";
import { t } from "ttag";

import { Flex, Group, Text } from "metabase/ui";

type Props = {
  icons?: ReactNode;
  noTitle?: boolean;
};

export const BaseAppearanceSection = ({
  children,
  icons,
  noTitle,
}: PropsWithChildren<Props>) => {
  return (
    <Flex direction="column" data-testid="appearance-section">
      <Group justify="space-between" align="center" mb="lg">
        {noTitle ? null : (
          <Text size="lg" fw="bold">
            {t`Appearance`}
          </Text>
        )}

        <Flex gap="md" align="center">
          {icons}
        </Flex>
      </Group>

      <Group align="start" gap="xl">
        {children}
      </Group>
    </Flex>
  );
};
