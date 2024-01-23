import { t } from "ttag";
import type { ReactNode } from "react";
import Button from "metabase/core/components/Button";
import { RemoveButton } from "./Sidebar.styled";

interface SidebarProps {
  closeIsDisabled?: boolean;
  children: ReactNode;
  onClose?: () => void;
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
  const WIDTH = 384;
  return (
    <aside
      data-testid={dataTestId}
      style={{ width: WIDTH, minWidth: WIDTH }}
      className="flex flex-column border-left bg-white"
    >
      <div className="flex flex-column flex-auto overflow-y-auto">
        {children}
      </div>
      {(onClose || onCancel || onRemove) && (
        <div
          className="flex align-center border-top"
          style={{
            paddingTop: 12,
            paddingBottom: 12,
            paddingRight: 32,
            paddingLeft: 32,
            gap: 20,
          }}
        >
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
        </div>
      )}
    </aside>
  );
}
