import React, { useCallback, useMemo } from "react";
import _ from "underscore";

import { TreeNode } from "metabase/components/tree/TreeNode";
import { IconProps } from "metabase/components/Icon";

import {
  FullWidthLink,
  NameContainer,
  NodeRoot,
  SidebarIcon,
  FullWidthButton,
} from "./SidebarItems.styled";

interface Props {
  children: string;
  url?: string;
  icon: string | IconProps | React.ReactElement;
  isSelected?: boolean;
  hasDefaultIconStyle?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onClick?: () => void;
}

type ContentProps = {
  children: React.ReactNode;
};

function isIconPropsObject(
  icon: string | IconProps | React.ReactNode,
): icon is IconProps {
  return _.isObject(icon);
}

function disableImageDragging(e: React.MouseEvent) {
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
  ...props
}: Props) {
  const renderIcon = useCallback(() => {
    if (React.isValidElement(icon)) {
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
      ? (props: ContentProps) => <FullWidthLink {...props} to={url} />
      : (props: ContentProps) => (
          <FullWidthButton {...props} isSelected={isSelected} />
        );
  }, [url, isSelected]);

  return (
    <NodeRoot
      depth={0}
      isSelected={isSelected}
      hasDefaultIconStyle={hasDefaultIconStyle}
      onMouseDown={disableImageDragging}
      {...props}
    >
      {React.isValidElement(left) && left}
      <Content>
        {icon && renderIcon()}
        <NameContainer>{children}</NameContainer>
      </Content>
      {React.isValidElement(right) && right}
    </NodeRoot>
  );
}

export default SidebarLink;
