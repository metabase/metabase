import cx from "classnames";

import { Flex, type FlexProps, Title, type TitleProps } from "metabase/ui";

import S from "./SidebarItem.module.css";

interface BaseSidebarItemRootProps {
  padded?: boolean;
  disabled?: boolean;
}

export const BaseSidebarItemRoot = (
  props: FlexProps & BaseSidebarItemRootProps = { padded: true },
) => {
  const { className, padded, disabled, ...rest } = props;

  return (
    <Flex
      align="center"
      className={cx(
        S.BaseSidebarItemRoot,
        {
          [S.padded]: padded !== false,
          [S.disabled]: disabled,
        },
        className,
      )}
      {...rest}
    />
  );
};

export const SelectableSidebarItemRoot = (
  props: FlexProps & BaseSidebarItemRootProps & { isSelected?: boolean },
) => {
  const { isSelected, ...rest } = props;

  return (
    <BaseSidebarItemRoot
      className={cx(S.SelectableSidebarItemRoot, {
        [S.isSelected]: isSelected,
      })}
      {...rest}
    />
  );
};

export const Content = (props: FlexProps) => {
  return <Flex align="center" w="100%" {...props} />;
};

export const Name = (props: TitleProps) => (
  <Title order={4} ta="left" textWrap="wrap" {...props} />
);
