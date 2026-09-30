import type { ReactNode } from "react";
import { t } from "ttag";

import { ResizableSidePanel } from "metabase/common/components/ResizableSidePanel";
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
    <ResizableSidePanel
      storageKey="dashboard-sidebar"
      side="right"
      defaultSize="lg"
      maxSize="xl"
    >
      <Box
        component="aside"
        data-testid={dataTestId}
        w="100%"
        h="100%"
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
                <Box display="flex">
                  <Button
                    leftSection={<Icon name="trash" />}
                    variant="transparent"
                    color="negative"
                    disabled={isRemoveDisabled}
                    onClick={onRemove}
                    size="compact-md"
                    role="button"
                    aria-label={t`Remove`}
                  >{t`Remove`}</Button>
                </Box>
              </Tooltip>
            )}
            {onCancel && (
              <Button
                variant="transparent"
                size="compact-md"
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
    </ResizableSidePanel>
  );
}
