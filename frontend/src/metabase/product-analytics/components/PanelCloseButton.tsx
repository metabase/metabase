import { t } from "ttag";

import { ActionIcon, Icon } from "metabase/ui";

type PanelCloseButtonProps = { onClose: () => void };

/** A side panel's X, at the end of its tab bar. */
export const PanelCloseButton = ({ onClose }: PanelCloseButtonProps) => (
  <ActionIcon
    variant="subtle"
    aria-label={t`Close`}
    ml="auto"
    style={{ alignSelf: "center" }}
    onClick={onClose}
  >
    <Icon name="close" />
  </ActionIcon>
);
