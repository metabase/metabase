import cx from "classnames";
import type { MouseEvent, ReactNode } from "react";
import { isValidElement } from "react";
import _ from "underscore";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { ForwardRefLink } from "metabase/common/components/Link";
import { TreeNode } from "metabase/common/components/tree/TreeNode";
import type { IconData } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import { Flex, Icon, type IconProps } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { SidebarItemName } from "./SidebarItemName";
import S from "./SidebarItems.module.css";

export interface SidebarLinkProps {
  children: string;
  url?: string;
  icon?: IconName | IconProps | IconData;
  isSelected?: boolean;
  left?: ReactNode;
  right?: ReactNode;
  onClick?: (event: MouseEvent) => void;
  target?: string;
  rel?: string;
  className?: string;
}

function isIconPropsObject(
  icon: string | IconProps | IconData,
): icon is IconProps | IconData {
  return _.isObject(icon);
}

function disableImageDragging(e: MouseEvent) {
  // https://www.redips.net/firefox/disable-image-dragging/

  // Also seems to prevent other hickups when dragging items
  // right after having dragged other items
  e.preventDefault();
}

interface SidebarLinkIconProps {
  icon: IconName | IconProps | IconData;
}

function SidebarLinkIcon({ icon }: SidebarLinkIconProps) {
  if (isValidElement(icon)) {
    return icon;
  }
  const iconProps = isIconPropsObject(icon) ? icon : { name: icon };
  const hasIconUrl = "iconUrl" in iconProps && iconProps.iconUrl;

  return (
    <TreeNode.IconContainer transparent={false} c="core-brand">
      {hasIconUrl ? (
        <EntityIcon
          name={iconProps.name}
          iconUrl={iconProps.iconUrl}
          size="1rem"
          color="core-brand"
        />
      ) : (
        <Icon {...iconProps} />
      )}
    </TreeNode.IconContainer>
  );
}

export function SidebarLink({
  children,
  icon,
  url,
  isSelected = false,
  left = null,
  right = null,
  onClick,
  target,
  rel,
  className,
  ...props
}: SidebarLinkProps) {
  const content = (
    <>
      {icon && <SidebarLinkIcon icon={icon} />}
      <SidebarItemName>{children}</SidebarItemName>
    </>
  );

  return (
    <TreeNode.Root
      depth={0}
      isSelected={isSelected}
      className={cx(S.nodeRoot, { [S.selected]: isSelected }, className)}
      bdrs="xxs"
      pl="md"
      aria-label={children}
      aria-selected={isSelected}
      onMouseDown={disableImageDragging}
      {...props}
    >
      {isValidElement(left) && <div>{left}</div>}
      {url ? (
        <Flex
          component={ForwardRefLink}
          className={S.link}
          align="center"
          w="100%"
          miw={0}
          to={url}
          target={target}
          rel={rel}
          onClick={onClick}
        >
          {content}
        </Flex>
      ) : (
        <Flex
          component="button"
          className={cx(S.button, CS.cursorPointer)}
          align="center"
          w="100%"
          miw={0}
          c="inherit"
          fw={700}
          ta="start"
          onClick={onClick}
        >
          {content}
        </Flex>
      )}
      {isValidElement(right) && <div>{right}</div>}
    </TreeNode.Root>
  );
}
