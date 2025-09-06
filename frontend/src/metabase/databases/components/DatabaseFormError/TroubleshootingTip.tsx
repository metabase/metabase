import type { ReactNode } from "react";

import {
  Box,
  Flex,
  type FlexProps,
  FixedSizeIcon as Icon,
  Text,
} from "metabase/ui";

import S from "./TroubleshootingTip.module.css";

export type TipProps = {
  body: ReactNode;
  noIcon?: boolean;
  title: string;
} & Pick<FlexProps, "pb">;

export const TroubleshootingTip = (props: TipProps) => {
  const { title, body, noIcon, ...flexProps } = props;

  return (
    <Flex
      className={S.container}
      gap="md"
      px="md"
      py="lg"
      {...flexProps}
      data-testid="troubleshooting-tip"
    >
      {!noIcon && <Icon name="info" mt={2} />}
      <Flex direction="column" gap="xs">
        <Text className={S.title}>{title}</Text>
        <Box className={S.body}>{body}</Box>
      </Flex>
    </Flex>
  );
};
