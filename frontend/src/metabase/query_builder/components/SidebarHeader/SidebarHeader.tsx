import React, { useMemo } from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import {
  HeaderRoot,
  HeaderIcon,
  HeaderTitleContainer,
  HeaderTitleContainerVariant,
  CloseButton,
} from "./SidebarHeader.styled";

type Props = {
  className?: string;
  title?: string;
  icon?: string;
  onBack?: () => void;
  onClose?: () => void;
};

function SidebarHeader({ className, title, icon, onBack, onClose }: Props) {
  const hasDefaultBackButton = useMemo(() => !title && onBack, [title, onBack]);

  const headerVariant = useMemo<HeaderTitleContainerVariant>(() => {
    if (hasDefaultBackButton) {
      return "default-back-button";
    }
    if (onBack) {
      return "back-button";
    }
    return "default";
  }, [hasDefaultBackButton, onBack]);

  const hasHeaderIcon = onBack || icon;

  return (
    <HeaderRoot className={className}>
      <HeaderTitleContainer variant={headerVariant} onClick={onBack}>
        {hasHeaderIcon && <HeaderIcon name={icon || "chevronleft"} />}
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

export default SidebarHeader;
