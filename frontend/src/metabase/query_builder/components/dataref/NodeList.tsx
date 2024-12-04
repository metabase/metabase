import cx from "classnames";
import type {
  AnchorHTMLAttributes,
  ComponentPropsWithRef,
  ReactNode,
} from "react";

import { Box, Flex, Icon, Text } from "metabase/ui";

import S from "./NodeList.module.css";

const NodeListTitle = ({ children }: { children: ReactNode }) => {
  return (
    <Flex align="center" fw={700} p="0.5rem 0.5rem 0.5rem 6px">
      {children}
    </Flex>
  );
};

const NodeListContainer = ({ children }: { children: ReactNode }) => {
  return (
    <Box component="ul" pt="md">
      {children}
    </Box>
  );
};

const NodeListTitleText = ({ children }: { children: ReactNode }) => {
  return (
    <Text component="span" ml="sm">
      {children}
    </Text>
  );
};

const QuestionId = ({ children }: { children: ReactNode }) => {
  return (
    <Box
      component="span"
      fz="0.75em"
      color="var(--mb-color-text-medium)"
      ml="xs"
    >
      {children}
    </Box>
  );
};

const NodeListItemName = ({ children }: { children: ReactNode }) => {
  return (
    <Text fw={700} ml="sm">
      {children}
    </Text>
  );
};

const NodeListIcon = (props: ComponentPropsWithRef<typeof Icon>) => (
  <Icon mt="1px" w="md" {...props} />
);

const NodeListItemIcon = (
  props: ComponentPropsWithRef<typeof Icon> & { disabled?: boolean },
) => {
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
  const { disabled, ...rest } = props;

  return (
    <a
      className={cx(S.NodeListItemLink, { [S.isDisabled]: disabled })}
      {...rest}
    />
  );
};

export {
  NodeListTitle,
  NodeListContainer,
  NodeListTitleText,
  QuestionId,
  NodeListItemName,
  NodeListIcon,
  NodeListItemIcon,
  NodeListItemLink,
};
