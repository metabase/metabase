import cx from "classnames";
import { t } from "ttag";

import type { FlexProps, IconName } from "metabase/ui";
import { Box, Flex, Icon } from "metabase/ui";

import SidebarHeaderS from "./SidebarHeader.module.css";

type HeaderTitleContainerVariant =
  | "default"
  | "back-button"
  | "default-back-button";

type Props = {
  className?: string;
  title?: string;
  icon?: IconName;
  onBack?: () => void;
  onClose?: () => void;
};

function getHeaderVariant({
  hasDefaultBackButton,
  hasOnBackHandler,
}: {
  hasDefaultBackButton: boolean;
  hasOnBackHandler: boolean;
}): HeaderTitleContainerVariant {
  if (hasDefaultBackButton) {
    return "default-back-button";
  }
  if (hasOnBackHandler) {
    return "back-button";
  }
  return "default";
}

const SidebarHeaderRoot = (props: FlexProps) => {
  return <Flex align="center" {...props} />;
};

function SidebarHeader({ className, title, icon, onBack, onClose }: Props) {
  const hasDefaultBackButton = !title && !!onBack;

  const headerVariant = getHeaderVariant({
    hasDefaultBackButton,
    hasOnBackHandler: !!onBack,
  });

  return (
    <SidebarHeaderRoot className={className}>
      <Box
        component="span"
        className={cx(SidebarHeaderS.HeaderTitleContainer, {
          [SidebarHeaderS.backButton]: headerVariant === "back-button",
          [SidebarHeaderS.defaultBackButton]:
            headerVariant === "default-back-button",
        })}
        onClick={onBack}
        data-testid="sidebar-header-title"
      >
        {onBack && <Icon mr="sm" name="chevronleft" />}
        {icon && <Icon mr="sm" name={icon} />}
        {hasDefaultBackButton ? t`Back` : title}
      </Box>
      {onClose && (
        <a className={SidebarHeaderS.CloseButton} onClick={onClose}>
          <Icon name="close" size={18} />
        </a>
      )}
    </SidebarHeaderRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SidebarHeader, { Root: SidebarHeaderRoot });
