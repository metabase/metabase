import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

interface DataReferenceButtonProps {
  className?: string;
  isShowingDataReference: boolean;
  onClick?: () => void;
}

export const DataReferenceButton = ({
  className,
  isShowingDataReference,
  onClick,
}: DataReferenceButtonProps) => (
  <Tooltip label={t`Learn about your data`}>
    <ActionIcon
      variant="subtle"
      className={className}
      aria-label={t`Learn about your data`}
      aria-pressed={isShowingDataReference}
      selected={isShowingDataReference}
      onClick={onClick}
    >
      <Icon name="reference" />
    </ActionIcon>
  </Tooltip>
);
