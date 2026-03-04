import { useState } from "react";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { DataReference } from "metabase/query_builder/components/dataref/DataReference";
import { Tooltip } from "metabase/ui";

export const DataReferenceInline = ({
  onClose,
  onBack,
}: {
  onClose?: () => void;
  onBack?: () => void;
}) => {
  const [dataRefStack, setDataRefStack] = useState<any[]>([]);

  const pushRefStack = (ref: any) => {
    setDataRefStack([...dataRefStack, ref]);
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
    <Button onlyIcon onClick={onClick} icon="reference" iconSize={16} />
  </Tooltip>
);
