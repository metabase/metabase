import cx from "classnames";
import type { HTMLAttributes, ReactNode } from "react";

import {
  Box,
  type BoxProps,
  Flex,
  type FlexProps,
  Text,
  type TextProps,
} from "metabase/ui";

import S from "./MetadataInfo.module.css";

export const Description = ({
  className,
  ...props
}: React.PropsWithChildren<BoxProps>) => {
  return <Box className={cx(S.Description, className)} {...props} />;
};

export const EmptyDescription = ({
  className,
  ...props
}: React.PropsWithChildren<BoxProps>) => {
  return (
    <Description className={cx(S.EmptyDescription, className)} {...props} />
  );
};

export const LabelContainer = (props: React.PropsWithChildren<FlexProps>) => {
  return (
    <Flex
      display="inline-flex"
      align="center"
      columnGap="0.3em"
      fw="normal"
      mb="sm"
      {...props}
    />
  );
};

export const Label = (props: React.PropsWithChildren<TextProps>) => {
  return <Text component="span" inherit c="inherit" lh="1em" {...props} />;
};

type FadeProps = BoxProps &
  HTMLAttributes<HTMLDivElement> & {
    visible?: boolean;
    slide?: boolean;
    children?: ReactNode;
  };

export const Fade = ({
  visible = false,
  slide = false,
  className,
  ...props
}: FadeProps) => {
  return (
    <Box
      className={cx(
        S.fade,
        { [S.slide]: slide, [S.slideOut]: slide && !visible },
        className,
      )}
      opacity={visible ? 1 : 0}
      {...props}
    />
  );
};
