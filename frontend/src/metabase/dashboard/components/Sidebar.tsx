import type { ReactNode } from "react";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

import {
  ButtonContainer,
  ChildrenContainer,
  SidebarAside,
} from "./Sidebar.styled";

interface SidebarProps {
  closeIsDisabled?: boolean;
  children: ReactNode;
  onClose?: () => void;
  onCancel?: () => void;
  onRemove?: () => void;
  "data-testid"?: string;
}

export const SIDEBAR_WIDTH = 384;
export function Sidebar({
  closeIsDisabled,
  children,
  onClose,
  onCancel,
  onRemove,
  "data-testid": dataTestId,
}: SidebarProps) {
  return (
    <SidebarAside data-testid={dataTestId} $width={SIDEBAR_WIDTH}>
      <ChildrenContainer>{children}</ChildrenContainer>
      {(onClose || onCancel || onRemove) && (
        <ButtonContainer spaceBetween>
          {onRemove && (
            <Button
              leftIcon={<Icon name="trash" />}
              variant="subtle"
              color="error"
              onClick={onRemove}
              style={{ paddingLeft: 0, paddingRight: 0 }}
              compact
              role="button"
              aria-label={t`Remove`}
            >{t`Remove`}</Button>
          )}
          {onCancel && (
            <Button
              variant="subtle"
              color="text-medium"
              onClick={onCancel}
              aria-label={t`Cancel`}
            >{t`Cancel`}</Button>
          )}
          {onClose && (
            <Button
              disabled={closeIsDisabled}
              onClick={onClose}
              variant="filled"
              aria-label={t`Done`}
            >{t`Done`}</Button>
          )}
        </ButtonContainer>
      )}
    </SidebarAside>
  );
}
