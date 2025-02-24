import cx from "classnames";
import { t } from "ttag";

import type { IconName } from "metabase/ui";
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

function SidebarHeader({ className, title, icon, onBack, onClose }: Props) {
  const hasDefaultBackButton = !title && !!onBack;

  const headerVariant = getHeaderVariant({
    hasDefaultBackButton,
    hasOnBackHandler: !!onBack,
  });

  return (
    <Flex
      align="flex-start"
      className={className}
      data-testid="sidebar-header"
      gap="sm"
    >
      <Flex
        className={cx(SidebarHeaderS.HeaderTitleContainer, {
          [SidebarHeaderS.backButton]: headerVariant === "back-button",
          [SidebarHeaderS.defaultBackButton]:
            headerVariant === "default-back-button",
        })}
        gap="sm"
        onClick={onBack}
        data-testid="sidebar-header-title"
      >
        {onBack && <Icon className={SidebarHeaderS.icon} name="chevronleft" />}
        {icon && <Icon className={SidebarHeaderS.icon} name={icon} />}
        {hasDefaultBackButton ? (
          t`Back`
        ) : (
          <Box
            className={SidebarHeaderS.title}
            component="span"
            pos="relative"
            top={-1}
          >
            {title}
          </Box>
        )}
      </Flex>

      {onClose && (
        <a className={SidebarHeaderS.CloseButton} onClick={onClose}>
          <Icon name="close" size={18} />
        </a>
      )}
    </Flex>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SidebarHeader);
