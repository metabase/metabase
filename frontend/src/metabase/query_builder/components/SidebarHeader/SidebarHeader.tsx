import { t } from "ttag";

import type { IconName } from "metabase/ui";
import { Icon } from "metabase/ui";

import type { HeaderTitleContainerVariant } from "./SidebarHeader.styled";
import {
  HeaderRoot,
  HeaderIcon,
  HeaderTitleContainer,
  CloseButton,
} from "./SidebarHeader.styled";

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
    <HeaderRoot className={className}>
      <HeaderTitleContainer
        variant={headerVariant}
        onClick={onBack}
        data-testid="sidebar-header-title"
      >
        {onBack && <HeaderIcon name="chevronleft" />}
        {icon && <HeaderIcon name={icon} />}
        {hasDefaultBackButton ? t`Back` : title}
      </HeaderTitleContainer>
      {onClose && (
        <CloseButton onClick={onClose}>
          <Icon name="close" size={18} />
        </CloseButton>
      )}
    </HeaderRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(SidebarHeader, { Root: HeaderRoot });
