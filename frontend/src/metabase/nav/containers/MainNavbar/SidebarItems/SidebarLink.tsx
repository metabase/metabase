import type { MouseEvent, ReactNode } from "react";
import { isValidElement, useCallback, useMemo } from "react";
import _ from "underscore";

import { TreeNode } from "metabase/components/tree/TreeNode";
import type { IconName, IconProps } from "metabase/ui";

import {
  FullWidthLink,
  ItemName,
  NameContainer,
  NodeRoot,
  SidebarIcon,
  FullWidthButton,
  LeftElementContainer,
  RightElementContainer,
} from "./SidebarItems.styled";

interface SidebarLinkProps {
  children: string;
  url?: string;
  icon?: IconName | IconProps | React.ReactElement;
  isSelected?: boolean;
  hasDefaultIconStyle?: boolean;
  left?: ReactNode;
  right?: ReactNode;
  onClick?: (event: MouseEvent) => void;
}

type ContentProps = {
  children: ReactNode;
};

function isIconPropsObject(
  icon: string | IconProps | React.ReactNode,
): icon is IconProps {
  return _.isObject(icon);
}

function disableImageDragging(e: MouseEvent) {
  // https://www.redips.net/firefox/disable-image-dragging/

  // Also seems to prevent other hickups when dragging items
  // right after having dragged other items
  e.preventDefault();
}

function SidebarLink({
  children,
  icon,
  url,
  isSelected = false,
  hasDefaultIconStyle,
  left = null,
  right = null,
  onClick,
  ...props
}: SidebarLinkProps) {
  const renderIcon = useCallback(() => {
    if (!icon) {
      return null;
    }
    if (isValidElement(icon)) {
      return icon;
    }
    const iconProps = isIconPropsObject(icon) ? icon : { name: icon };
    return (
      <TreeNode.IconContainer transparent={false}>
        <SidebarIcon {...iconProps} isSelected={isSelected} />
      </TreeNode.IconContainer>
    );
  }, [icon, isSelected]);

  const Content = useMemo(() => {
    return url
      ? (props: ContentProps) => (
          <FullWidthLink {...props} to={url} onClick={onClick} />
        )
      : (props: ContentProps) => (
          <FullWidthButton
            {...props}
            isSelected={isSelected}
            onClick={onClick}
          />
        );
  }, [url, isSelected, onClick]);

  return (
    <NodeRoot
      depth={0}
      isSelected={isSelected}
      hasDefaultIconStyle={hasDefaultIconStyle}
      aria-label={children}
      aria-selected={isSelected}
      onMouseDown={disableImageDragging}
      {...props}
    >
      {isValidElement(left) && (
        <LeftElementContainer>{left}</LeftElementContainer>
      )}
      <Content>
        {icon && renderIcon()}
        <NameContainer>{children}</NameContainer>
      </Content>
      {isValidElement(right) && (
        <RightElementContainer>{right}</RightElementContainer>
      )}
    </NodeRoot>
  );
}

export type { SidebarLinkProps };

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SidebarLink, {
  NameContainers: [ItemName, TreeNode.NameContainer],
  Icon: SidebarIcon,
  LeftElement: LeftElementContainer,
  RightElement: RightElementContainer,
});
