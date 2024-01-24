import { t } from "ttag";
import type { ReactNode } from "react";
import Button from "metabase/core/components/Button";
import {
  ButtonContainer,
  ChildrenContainer,
  RemoveButton,
  SidebarAside,
} from "./Sidebar.styled";

interface SidebarProps {
  closeIsDisabled?: boolean;
  children: ReactNode;
  onClose?: () => void;
  // TODO remove this option once Pulses are deprecated and NewPulseSidebar component is no longer needed
  onCancel?: () => void;
  onRemove?: () => void;
  "data-testid"?: string;
}

export function Sidebar({
  closeIsDisabled,
  children,
  onClose,
  onCancel,
  onRemove,
  "data-testid": dataTestId,
}: SidebarProps) {
  return (
    <SidebarAside data-testid={dataTestId} $width={384}>
      <ChildrenContainer>{children}</ChildrenContainer>
      {(onClose || onCancel || onRemove) && (
        <ButtonContainer>
          {onRemove && (
            <RemoveButton onClick={onRemove}>{t`Remove`}</RemoveButton>
          )}
          {onCancel && (
            <Button small borderless onClick={onCancel}>{t`Cancel`}</Button>
          )}
          {onClose && (
            <Button
              primary
              small
              className="ml-auto"
              onClick={onClose}
              disabled={closeIsDisabled}
            >{t`Done`}</Button>
          )}
        </ButtonContainer>
      )}
    </SidebarAside>
  );
}
