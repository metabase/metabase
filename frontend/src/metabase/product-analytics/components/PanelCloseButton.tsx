import { t } from "ttag";

import { ActionIcon, Icon } from "metabase/ui";

type PanelCloseButtonProps = {
  onClose: () => void;
  /**
   * In a tab bar with `pt="sm"`, the button centers on the tabs below that
   * padding; a negative margin of the same size lifts it by half, to the
   * middle of the whole bar.
   */
  isInTabBar?: boolean;
};

/** A side panel's X, at the end of its header. */
export const PanelCloseButton = ({
  onClose,
  isInTabBar = false,
}: PanelCloseButtonProps) => (
  <ActionIcon
    variant="subtle"
    aria-label={t`Close`}
    ml="auto"
    mt={isInTabBar ? "calc(-1 * var(--mantine-spacing-sm))" : undefined}
    style={{ alignSelf: "center" }}
    onClick={onClose}
  >
    <Icon name="close" />
  </ActionIcon>
);
