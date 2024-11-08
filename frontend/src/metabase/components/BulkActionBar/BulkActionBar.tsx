import cx from "classnames";

import Animation from "metabase/css/core/animation.module.css";
import ZIndex from "metabase/css/core/z-index.module.css";
import { useSelector } from "metabase/lib/redux";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { Box, type BoxProps, Flex, Portal, Text } from "metabase/ui";

import { BulkActionsToast, ToastCard } from "./BulkActionBar.styled";

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
}: BulkActionsProps & BoxProps) => {
  if (!opened) {
    return null;
  }
  return (
    <Portal>
      <Box
        component={BulkActionsToast}
        isNavbarOpen={isNavbarOpen}
        className={cx(className, ZIndex.FloatingElement, Animation.popToast)}
      >
        <Box component={ToastCard} dark data-testid="toast-card" {...props}>
          {message && <Text color="text-white">{message}</Text>}
          <Flex gap="sm" align="center">
            {children}
          </Flex>
        </Box>
      </Box>
    </Portal>
  );
};
