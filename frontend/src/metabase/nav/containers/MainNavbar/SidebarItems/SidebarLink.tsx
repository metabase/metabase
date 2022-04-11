import React, { useCallback } from "react";
import _ from "underscore";

import { TreeNode } from "metabase/components/tree/TreeNode";
import { IconProps } from "metabase/components/Icon";

import {
  FullWidthLink,
  NameContainer,
  NodeRoot,
  SidebarIcon,
} from "./SidebarItems.styled";

interface Props {
  children: string;
  url: string;
  icon: string | IconProps | React.ReactElement;
  isSelected?: boolean;
  hasDefaultIconStyle?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onClick?: () => void;
}

function isIconPropsObject(
  icon: string | IconProps | React.ReactNode,
): icon is IconProps {
  return _.isObject(icon);
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

  return (
    <NodeRoot
      depth={0}
      isSelected={isSelected}
      hasDefaultIconStyle={hasDefaultIconStyle}
      {...props}
    >
      {React.isValidElement(left) && left}
      <FullWidthLink to={url}>
        {icon && renderIcon()}
        <NameContainer>{children}</NameContainer>
      </FullWidthLink>
      {React.isValidElement(right) && right}
    </NodeRoot>
  );
}

export default SidebarLink;
