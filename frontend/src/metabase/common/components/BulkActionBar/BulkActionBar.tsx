import cx from "classnames";
import type { HTMLAttributes } from "react";

import Animation from "metabase/css/core/animation.module.css";
import { type BoxProps, Flex, Portal, Text } from "metabase/ui";

import { BulkActionsToast, ToastCard } from "./BulkActionBar.styled";

type BulkActionsProps = {
  opened: boolean;
  message: string;
  children: React.ReactNode | React.ReactNode[];
  className?: string;
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
  return <BulkActionBarPortal {...props} />;
};

export const BulkActionBarPortal = ({
  opened,
  message,
  children,
  className,
  ...props
}: BulkActionsProps & BoxProps & HTMLAttributes<HTMLDivElement>) => {
  if (!opened) {
    return null;
  }
  return (
    <Portal>
      <BulkActionsToast className={cx(className, Animation.popToast)}>
        <ToastCard data-testid="toast-card" {...props}>
          {message && <Text color="text-primary-inverse">{message}</Text>}
          <Flex gap="sm" align="center">
            {children}
          </Flex>
        </ToastCard>
      </BulkActionsToast>
    </Portal>
  );
};
