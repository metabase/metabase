import { t } from "ttag";
import type { ReactNode } from "react";
import ButtonDeprecated from "metabase/core/components/Button";
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
        <ButtonContainer>
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
            <ButtonDeprecated
              small
              borderless
              onClick={onCancel}
            >{t`Cancel`}</ButtonDeprecated>
          )}
          {onClose && (
            <ButtonDeprecated
              primary
              small
              className="ml-auto"
              onClick={onClose}
              disabled={closeIsDisabled}
            >{t`Done`}</ButtonDeprecated>
          )}
        </ButtonContainer>
      )}
    </SidebarAside>
  );
}
