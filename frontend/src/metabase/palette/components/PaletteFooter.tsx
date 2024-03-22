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
      <Flex gap=".33rem">
        <Icon color={color("text-light")} name="sort" />
        <Text tt="uppercase" weight="bold" size="10px" color={color("medium")}>
          {t`Select`}
        </Text>
      </Flex>
      <Flex gap=".33rem">
        <Icon name="enter_or_return" color={color("text-light")} />
        <Text tt="uppercase" weight="bold" size="10px" color={color("medium")}>
          {t`Open`}
        </Text>
      </Flex>
    </Flex>
  );
};
