import React, { ReactNode } from "react";
import Icon from "metabase/components/Icon";
import {
  HomeLinkActions,
  HomeLinkContent,
  HomeLinkDescription,
  HomeLinkIconContainer,
  HomeLinkRoot,
  HomeLinkTitle,
} from "./HomeLink.styled";

export interface HomeLinkProps {
  title: string;
  description?: string | null;
  icon: HomeModelIconProps;
  url: string;
  canEdit?: boolean;
  actions?: ReactNode;
  isExternal?: boolean;
}

export interface HomeModelIconProps {
  name: string;
}

const HomeLink = ({
  title,
  description,
  icon,
  url,
  actions,
  isExternal,
}: HomeLinkProps) => {
  return (
    <HomeLinkRoot url={url} isExternal={isExternal}>
      <HomeLinkIconContainer>
        <Icon {...icon} />
      </HomeLinkIconContainer>
      <HomeLinkContent>
        <HomeLinkTitle>{title}</HomeLinkTitle>
        {description && (
          <HomeLinkDescription>{description}</HomeLinkDescription>
        )}
      </HomeLinkContent>
      {actions && (
        <HomeLinkActions onClick={e => e.preventDefault()}>
          {actions}
        </HomeLinkActions>
      )}
    </HomeLinkRoot>
  );
};

export default HomeLink;
