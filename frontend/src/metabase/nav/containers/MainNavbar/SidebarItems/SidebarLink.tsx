import React from "react";
import _ from "underscore";

import { TreeNode } from "metabase/components/tree/TreeNode";
import Icon from "metabase/components/Icon";

import { FullWidthLink, NameContainer } from "./SidebarItems.styled";

interface Props {
  children: string;
  url: string;
  icon: string;
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
  return (
    <TreeNode.Root depth={0} isSelected={isSelected} {...props}>
      <FullWidthLink to={url}>
        {icon && (
          <TreeNode.IconContainer>
            <Icon name={icon} />
          </TreeNode.IconContainer>
        )}
        <NameContainer>{children}</NameContainer>
      </FullWidthLink>
      {React.isValidElement(right) && right}
    </TreeNode.Root>
  );
}

export default SidebarLink;
