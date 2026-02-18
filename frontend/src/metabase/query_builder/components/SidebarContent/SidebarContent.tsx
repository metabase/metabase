import cx from "classnames";
import type { ReactNode } from "react";
import type React from "react";
import { t } from "ttag";

import {
  Box,
  type BoxProps,
  Flex,
  type FlexProps,
  type IconName,
} from "metabase/ui";

import { SidebarHeader } from "../SidebarHeader";
import { ViewButton } from "../view/ViewButton";

import SidebarContentS from "./SidebarContent.module.css";

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
  headerActions?: ReactNode;
  "data-testid"?: string;
};

const SidebarContentMain = ({
  children,
  ...props
}: BoxProps & { children: React.ReactNode }) => {
  return (
    <Box className={SidebarContentS.SidebarContentMain} {...props}>
      {children}
    </Box>
  );
};

const SidebarContentRoot = ({ className, children, ...props }: FlexProps) => {
  return (
    <Flex
      direction="column"
      justify="space-between"
      className={cx(SidebarContentS.SidebarContentRoot, className)}
      {...props}
    >
      {children}
    </Flex>
  );
};

function SidebarContentInner({
  className,
  title,
  icon,
  color,
  onBack,
  onClose,
  onDone,
  doneButtonText = t`Done`,
  footer = onDone ? (
    <ViewButton
      className={SidebarContentS.FooterButton}
      color={color}
      onClick={onDone}
      active
    >
      {doneButtonText}
    </ViewButton>
  ) : null,
  children,
  headerActions,
  "data-testid": dataTestId,
}: Props) {
  return (
    <SidebarContentRoot data-testid={dataTestId} className={className}>
      <SidebarContentMain data-testid="sidebar-content">
        {(title || icon || onBack) && (
          <SidebarHeader
            className={SidebarContentS.SidebarContentHeader}
            title={title}
            icon={icon}
            onBack={onBack}
            onClose={onClose}
            actions={headerActions}
          />
        )}
        {children}
      </SidebarContentMain>
      {footer}
    </SidebarContentRoot>
  );
}

const PaneContent = (props: BoxProps & { children: React.ReactNode }) => {
  return <Box px="lg" {...props} />;
};

export const SidebarContent = Object.assign(SidebarContentInner, {
  Root: SidebarContentRoot,
  Header: SidebarHeader,
  Content: SidebarContentMain,
  Pane: PaneContent,
});
