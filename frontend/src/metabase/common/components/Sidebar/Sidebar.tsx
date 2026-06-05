import type { ReactNode } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Icon, Tooltip } from "metabase/ui";

import S from "./Sidebar.module.css";

interface SidebarProps {
  children: ReactNode;
  onClose?: () => void;
  onCancel?: () => void;
  onRemove?: () => void;
  isCloseDisabled?: boolean;
  closeTooltip?: string;
  isRemoveDisabled?: boolean;
  removeTooltip?: string;
  "data-testid"?: string;
}

export const SIDEBAR_WIDTH = 384;
export function Sidebar({
  isCloseDisabled,
  children,
  onClose,
  onCancel,
  onRemove,
  closeTooltip,
  isRemoveDisabled,
  removeTooltip,
  "data-testid": dataTestId,
}: SidebarProps) {
  return (
    <Box
      component="aside"
      data-testid={dataTestId}
      miw={SIDEBAR_WIDTH}
      w={SIDEBAR_WIDTH}
      className={S.SidebarAside}
    >
      <Flex direction="column" className={S.ChildrenContainer}>
        {children}
      </Flex>
      {(onClose || onCancel || onRemove) && (
        <Flex
          justify="space-between"
          align="center"
          gap="20px"
          p="0.75rem 2rem"
          className={S.ButtonContainer}
        >
          {onRemove && (
            <Tooltip label={removeTooltip} disabled={!removeTooltip}>
              {/* without a div we will need hacks to make tooltip work */}
              <div>
                <Button
                  leftSection={<Icon name="trash" />}
                  variant="subtle"
                  color="error"
                  disabled={isRemoveDisabled}
                  onClick={onRemove}
                  style={{ paddingLeft: 0, paddingRight: 0 }}
                  size="compact-md"
                  role="button"
                  aria-label={t`Remove`}
                >{t`Remove`}</Button>
              </div>
            </Tooltip>
          )}
          {onCancel && (
            <Button
              variant="subtle"
              color="text-secondary"
              onClick={onCancel}
              aria-label={t`Cancel`}
            >{t`Cancel`}</Button>
          )}
          {onClose && (
            <Tooltip label={closeTooltip} disabled={!closeTooltip}>
              {/* without a div we will need hacks to make tooltip work */}
              <div>
                <Button
                  disabled={isCloseDisabled}
                  onClick={onClose}
                  variant="filled"
                  aria-label={t`Done`}
                >{t`Done`}</Button>
              </div>
            </Tooltip>
          )}
        </Flex>
      )}
    </Box>
  );
}
