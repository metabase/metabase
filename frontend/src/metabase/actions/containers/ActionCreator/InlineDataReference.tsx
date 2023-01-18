import React, { useState } from "react";
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";

import DataReference from "metabase/query_builder/components/dataref/DataReference";

import {
  DataReferenceContainer,
  TriggerButton,
} from "./InlineDataReference.styled";

export const DataReferenceInline = ({
  onClose,
  isOpen,
}: {
  onClose: () => void;
  isOpen: boolean;
}) => {
  const [dataRefStack, setDataRefStack] = useState<any[]>([]);

  const pushRefStack = (ref: any) => {
    setDataRefStack([...dataRefStack, ref]);
  };

  const popRefStack = () => {
    setDataRefStack(dataRefStack.slice(0, -1));
  };

  return (
    <DataReferenceContainer isOpen={isOpen}>
      <DataReference
        dataReferenceStack={dataRefStack}
        popDataReferenceStack={popRefStack}
        pushDataReferenceStack={pushRefStack}
        onClose={onClose}
      />
    </DataReferenceContainer>
  );
};

export const DataReferenceTriggerButton = ({
  onClick,
}: {
  onClick: () => void;
}) => (
  <Tooltip tooltip={t`Data Reference`}>
    <TriggerButton onlyIcon onClick={onClick} icon="reference" iconSize={16} />
  </Tooltip>
);
