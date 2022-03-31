import React, { useCallback } from "react";
import _ from "underscore";

import { TreeNode } from "metabase/components/tree/TreeNode";
import Icon, { IconProps } from "metabase/components/Icon";

import { FullWidthLink, NameContainer } from "./SidebarItems.styled";

interface Props {
  children: string;
  url: string;
  icon: string | IconProps | React.ReactElement;
  isSelected?: boolean;
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
  right = null,
  ...props
}: Props) {
  const renderIcon = useCallback(() => {
    if (React.isValidElement(icon)) {
      return icon;
    }
    const iconProps = isIconPropsObject(icon) ? icon : { name: icon };
    return (
      <TreeNode.IconContainer>
        <Icon {...iconProps} size={14} />
      </TreeNode.IconContainer>
    );
  }, [icon]);

  return (
    <TreeNode.Root depth={0} isSelected={isSelected} {...props}>
      <FullWidthLink to={url}>
        {icon && renderIcon()}
        <NameContainer>{children}</NameContainer>
      </FullWidthLink>
      {React.isValidElement(right) && right}
    </TreeNode.Root>
  );
}

export default SidebarLink;
