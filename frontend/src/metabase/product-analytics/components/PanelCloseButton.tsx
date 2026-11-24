import { t } from "ttag";

import { ActionIcon, Icon } from "metabase/ui";

type PanelCloseButtonProps = {
  onClose: () => void;
};

export const PanelCloseButton = ({ onClose }: PanelCloseButtonProps) => (
  <ActionIcon variant="subtle" aria-label={t`Close`} onClick={onClose}>
    <Icon name="close" />
  </ActionIcon>
);
