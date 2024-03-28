import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Flex, Icon, Text } from "metabase/ui";

export const PaletteFooter = () => {
  return (
    <Flex
      p=".5rem 1.5rem"
      gap="1.5rem"
      style={{
        borderTop: `1px solid ${color("border")}`,
      }}
    >
      <Flex gap=".33rem" c={color("text-medium")} lh="1rem">
        <Icon name="sort" />
        <Text size="12px">{t`Select`}</Text>
      </Flex>
    </Flex>
  );
};
