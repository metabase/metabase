import cx from "classnames";
import type { AnchorHTMLAttributes } from "react";
import type React from "react";

import {
  Box,
  type BoxProps,
  Flex,
  type FlexProps,
  Icon,
  type IconProps,
} from "metabase/ui";

import S from "./NodeList.module.css";

type BoxPropsWithChildren = BoxProps & { children: React.ReactNode };

const NodeListTitle = ({ children, ...rest }: FlexProps) => {
  return (
    <Flex align="center" fw={700} p="0.5rem 0.5rem 0.5rem 6px" {...rest}>
      {children}
    </Flex>
  );
};

const NodeListContainer = ({ children, ...rest }: BoxPropsWithChildren) => {
  return (
    <Box component="ul" pt="md" {...rest}>
      {children}
    </Box>
  );
};

const NodeListTitleText = ({ children, ...rest }: BoxPropsWithChildren) => {
  return (
    <Box component="span" ml="sm" {...rest}>
      {children}
    </Box>
  );
};

const NodeListItemId = ({ children, ...rest }: BoxPropsWithChildren) => {
  return (
    <Box
      component="span"
      fz="0.75em"
      ml="xs"
      className={S.NodeListItemId}
      {...rest}
    >
      {children}
    </Box>
  );
};

const NodeListItemName = ({ children, ...rest }: BoxPropsWithChildren) => {
  return (
    <Box component="span" fw={700} ml="sm" {...rest}>
      {children}
    </Box>
  );
};

const NodeListIcon = (props: IconProps) => <Icon mt="1px" w="md" {...props} />;

const NodeListItemIcon = (props: IconProps & { disabled?: boolean }) => {
  const { disabled, ...rest } = props;

  return (
    <Icon
      className={cx(S.NodeListItemIcon, { [S.isDisabled]: disabled })}
      {...rest}
    />
  );
};

const NodeListItemLink = (
  props: AnchorHTMLAttributes<HTMLAnchorElement> & { disabled?: boolean },
) => {
  const { disabled, className, ...rest } = props;

  return (
    <a
      className={cx(
        S.NodeListItemLink,
        { [S.isDisabled]: disabled },
        className,
      )}
      {...rest}
    />
  );
};

export {
  NodeListTitle,
  NodeListContainer,
  NodeListTitleText,
  NodeListItemId,
  NodeListItemName,
  NodeListIcon,
  NodeListItemIcon,
  NodeListItemLink,
};
