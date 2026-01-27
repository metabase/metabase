import type { ComponentProps } from "react";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import {
  Box,
  type BoxProps,
  Flex,
  type FlexProps,
  Icon,
  type IconProps,
} from "metabase/ui";

import S from "./DisabledNativeCardHelpText.module.css";

export const NativeCardDefault = (props: FlexProps) => {
  return <Flex direction="column" align="center" {...props} />;
};

export const NativeCardIcon = (props: IconProps) => {
  return (
    <Icon
      mb="sm"
      w="1.25rem"
      h="1.25rem"
      className={S.NativeCardIcon}
      {...props}
    />
  );
};

export const NativeCardText = (
  props: BoxProps & { children?: React.ReactNode },
) => {
  return (
    <Box maw="15rem" lh="1.5rem" className={S.NativeCardText} {...props} />
  );
};

export const NativeCardLink = (props: ComponentProps<typeof ExternalLink>) => {
  return <ExternalLink className={S.NativeCardLink} {...props} />;
};
