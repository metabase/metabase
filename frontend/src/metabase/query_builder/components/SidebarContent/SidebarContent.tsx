import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, type BoxProps, Flex, type IconName } from "metabase/ui";

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
    <Flex
      direction="column"
      justify="space-between"
      h="100%"
      data-testid={dataTestId}
      className={className}
    >
      <Box
        className={SidebarContentS.SidebarContentMain}
        data-testid="sidebar-content"
      >
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
      </Box>
      {footer}
    </Flex>
  );
}

export const PaneContent = (props: BoxProps) => {
  return <Box pl="lg" pr="lg" {...props} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SidebarContent, {
  Header: SidebarHeader,
  Content: SidebarContentMain,
  Pane: PaneContent,
});
