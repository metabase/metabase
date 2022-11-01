import React, { useState } from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

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
  <TriggerButton
    title={t`Data Reference`}
    borderless
    onClick={onClick}
    style={{ position: "absolute", top: 10, right: 10, zIndex: 10 }}
  >
    <Icon name="reference" size={16} />
  </TriggerButton>
);
