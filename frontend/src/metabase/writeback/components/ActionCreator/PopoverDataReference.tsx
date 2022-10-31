import React, { useState } from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Button from "metabase/core/components/Button";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import DataReference from "metabase/query_builder/components/dataref/DataReference";

import { DataReferencePopoverContainer } from "./PopoverDataReference.styled";

export const PopoverDataReferenceButton = () => {
  const [dataRefStack, setDataRefStack] = useState<any[]>([]);

  const pushRefStack = (ref: any) => {
    setDataRefStack([...dataRefStack, ref]);
  };

  const popRefStack = () => {
    setDataRefStack(dataRefStack.slice(0, -1));
  };

  return (
    <TippyPopoverWithTrigger
      placement="bottom-start"
      sizeToFit
      renderTrigger={({ onClick, visible }) => (
        <Button
          title={t`Data Reference`}
          borderless
          onClick={e => {
            e.preventDefault();
            onClick();
          }}
          style={{ position: "absolute", top: 0, right: 0, marginTop: 10 }}
        >
          <Icon name="reference" size={16} />
        </Button>
      )}
      popoverContent={({ closePopover }) => (
        <DataReferencePopoverContainer>
          <DataReference
            dataReferenceStack={dataRefStack}
            popDataReferenceStack={popRefStack}
            pushDataReferenceStack={pushRefStack}
            onClose={closePopover}
          />
        </DataReferencePopoverContainer>
      )}
    />
  );
};
