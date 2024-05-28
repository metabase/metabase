import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import type { IconName } from "metabase/ui";

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
  "data-testid"?: string;
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
  "data-testid": dataTestId,
}: Props) {
  return (
    <SidebarContentRoot data-testid={dataTestId} className={className}>
      <SidebarContentMain data-testid="sidebar-content">
        {(title || icon || onBack) && (
          <SidebarHeader
            className={cx(CS.mx3, CS.my2, CS.pt1)}
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
