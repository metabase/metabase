import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import {
  Box,
  type BoxProps,
  Flex,
  type FlexProps,
  type IconName,
} from "metabase/ui";

import SidebarHeader from "../SidebarHeader";
import ViewButton from "../view/ViewButton";

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
  "data-testid"?: string;
};

const SidebarContentMain = ({ children, ...props }: BoxProps) => {
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
          />
        )}
        {children}
      </SidebarContentMain>
      {footer}
    </SidebarContentRoot>
  );
}

export const PaneContent = (props: BoxProps) => {
  return <Box px="lg" {...props} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SidebarContent, {
  Root: SidebarContentRoot,
  Header: SidebarHeader,
  Content: SidebarContentMain,
  Pane: PaneContent,
});
