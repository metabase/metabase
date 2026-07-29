import { useState } from "react";
import { t } from "ttag";

import { DataReference } from "metabase/querying/components/DataReference/DataReference";
import type { DataReferenceItem } from "metabase/querying/components/DataReference/types";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";

export const DataReferenceInline = ({
  onClose,
  onBack,
}: {
  onClose?: () => void;
  onBack?: () => void;
}) => {
  const [dataRefStack, setDataRefStack] = useState<DataReferenceItem[]>([]);

  const pushRefStack = (item: DataReferenceItem) => {
    setDataRefStack([...dataRefStack, item]);
  };

  const popRefStack = () => {
    setDataRefStack(dataRefStack.slice(0, -1));
  };

  return (
    <DataReference
      dataReferenceStack={dataRefStack}
      popDataReferenceStack={popRefStack}
      pushDataReferenceStack={pushRefStack}
      onClose={onClose}
      onBack={onBack}
    />
  );
};

export const DataReferenceTriggerButton = ({
  onClick,
}: {
  onClick: () => void;
}) => (
  <Tooltip label={t`Data Reference`}>
    <ActionIcon
      variant="viewHeader"
      onClick={onClick}
      aria-label={t`Data Reference`}
    >
      <Icon name="reference" />
    </ActionIcon>
  </Tooltip>
);
