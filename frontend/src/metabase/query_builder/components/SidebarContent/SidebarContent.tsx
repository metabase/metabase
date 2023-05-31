import React, { ReactNode } from "react";
import { t } from "ttag";
import { IconName } from "metabase/core/components/Icon";
import SidebarHeader from "../SidebarHeader";
import {
  SidebarContentRoot,
  SidebarContentMain,
  FooterButton,
} from "./SidebarContent.styled";

type Props = {
  className?: string;
  title?: string;
  icon?: IconName;
  color?: string;
  onBack?: () => void;
  onClose?: () => void;
  onDone?: () => void;
  doneButtonText?: string;
  footer?: ReactNode;
  children?: ReactNode;
};

function SidebarContent({
  className,
  title,
  icon,
  color,
  onBack,
  onClose,
  onDone,
  doneButtonText = t`Done`,
  footer = onDone ? (
    <FooterButton color={color} onClick={onDone}>
      {doneButtonText}
    </FooterButton>
  ) : null,
  children,
}: Props) {
  return (
    <SidebarContentRoot className={className}>
      <SidebarContentMain data-testid="sidebar-content">
        {(title || icon || onBack) && (
          <SidebarHeader
            className="mx3 my2 pt1"
            title={title}
            icon={icon}
            onBack={onBack}
            onClose={onClose}
          />
        )}
        {children}
      </SidebarContentMain>
      {footer}
    </SidebarContentRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SidebarContent, {
  Root: SidebarContentRoot,
  Header: SidebarHeader,
  Content: SidebarContentMain,
});
