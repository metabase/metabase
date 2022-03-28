import React from "react";
import _ from "underscore";

import { TreeNode } from "metabase/components/tree/TreeNode";
import Icon, { IconProps } from "metabase/components/Icon";

import { FullWidthLink, NameContainer } from "./SidebarItems.styled";

interface Props {
  children: string;
  url: string;
  icon: string | IconProps;
  isSelected?: boolean;
  right?: React.ReactNode;
}

function SidebarLink({
  children,
  icon,
  url,
  isSelected = false,
  right = null,
  ...props
}: Props) {
  const iconProps = _.isObject(icon) ? icon : { name: icon };
  return (
    <TreeNode.Root depth={0} isSelected={isSelected} {...props}>
      <FullWidthLink to={url}>
        {iconProps && (
          <TreeNode.IconContainer>
            <Icon {...iconProps} />
          </TreeNode.IconContainer>
        )}
        <NameContainer>{children}</NameContainer>
      </FullWidthLink>
      {React.isValidElement(right) && right}
    </TreeNode.Root>
  );
}

export default SidebarLink;
