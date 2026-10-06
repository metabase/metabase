import cx from "classnames";
import type { HTMLAttributes } from "react";

import Animation from "metabase/css/core/animation.module.css";
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";
import { useSelector } from "metabase/redux";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { Box, type BoxProps, Card, Flex, Portal, Text } from "metabase/ui";

import S from "./BulkActionBar.module.css";

type BulkActionsProps = {
  opened: boolean;
  message: string;
  children: React.ReactNode | React.ReactNode[];
  className?: string;
  isNavbarOpen?: boolean;
};

/**
 * A generic floating notification that appears at the bottom of the screen with a message and
 * children that is generally used when multiple items have been selected and you need a UI element
 * to perform actions on those items.
 *
 * @param {boolean} opened  - Whether the notification is open or not
 * @param {string} message  - The message to display in the notification
 * @param {any} children    - The children to display in the notification, meant to be used with BulkActionButton components.
 * @returns
 */
export const BulkActionBar = (props: BulkActionsProps) => {
  const isNavbarOpen = useSelector(getIsNavbarOpen);
  return <BulkActionBarPortal {...props} isNavbarOpen={isNavbarOpen} />;
};

export const BulkActionBarPortal = ({
  opened,
  message,
  children,
  className,
  isNavbarOpen = true,
  ...props
}: BulkActionsProps & BoxProps & HTMLAttributes<HTMLDivElement>) => {
  if (!opened) {
    return null;
  }
  return (
    <Portal>
      <Box
        className={cx(S.toast, className, Animation.popToast)}
        ml={isNavbarOpen ? NAV_SIDEBAR_WIDTH : 0}
      >
        <Card className={S.toastCard} data-testid="toast-card" {...props}>
          {message && <Text c="tooltip-text">{message}</Text>}
          <Flex gap="sm" align="center">
            {children}
          </Flex>
        </Card>
      </Box>
    </Portal>
  );
};
