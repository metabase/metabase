import { useSelector } from "metabase/lib/redux";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { Transition, Flex, Text } from "metabase/ui";

import { BulkActionsToast, ToastCard } from "./BulkActionBar.styled";

const slideIn = {
  in: { opacity: 1, transform: "translate(-50%, 0)" },
  out: { opacity: 0, transform: "translate(-50%, 100px)" },
  common: { transformOrigin: "top" },
  transitionProperty: "transform, opacity",
};

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
export const BulkActionBar = ({
  opened,
  message,
  children,
  className,
}: BulkActionsProps) => {
  const isNavbarOpen = useSelector(getIsNavbarOpen);

  return (
    <Transition
      mounted={opened}
      transition={slideIn}
      duration={400}
      timingFunction="ease"
    >
      {styles => (
        <BulkActionsToast
          style={styles}
          isNavbarOpen={isNavbarOpen}
          className={className}
        >
          <ToastCard dark data-testid="toast-card">
            {message && <Text color="text-white">{message}</Text>}
            <Flex gap="sm" align="center">
              {children}
            </Flex>
          </ToastCard>
        </BulkActionsToast>
      )}
    </Transition>
  );
};
