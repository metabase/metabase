import { useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import DataReference from "metabase/query_builder/components/dataref/DataReference";

export const DataReferenceInline = ({ onClose }: { onClose: () => void }) => {
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
    />
  );
};

export const DataReferenceTriggerButton = ({
  onClick,
}: {
  onClick: () => void;
}) => (
  <Tooltip tooltip={t`Data Reference`}>
    <Button onlyIcon onClick={onClick} icon="reference" iconSize={16} />
  </Tooltip>
);
