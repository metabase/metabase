import { t } from "ttag";

import { Icon } from "metabase/ui";
import Tooltip from "metabase/core/components/Tooltip";

import { ButtonRoot } from "./DataReferenceButton.styled";

interface DataReferenceButtonProps {
  className?: string;
  isShowingDataReference: boolean;
  size: number;
  toggleDataReference: () => void;
}

export const DataReferenceButton = ({
  className,
  isShowingDataReference,
  size,
  toggleDataReference,
}: DataReferenceButtonProps) => (
  <Tooltip tooltip={t`Learn about your data`}>
    <ButtonRoot className={className} isSelected={isShowingDataReference}>
      <Icon name="reference" size={size} onClick={toggleDataReference} />
    </ButtonRoot>
  </Tooltip>
);
