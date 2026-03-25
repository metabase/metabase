import type { ComponentType } from "react";

import { MainPane } from "./MainPane";
import {
  type DataReferenceItem,
  type DataReferencePaneProps,
  PANES,
} from "./types";

export const DataReference = ({
  dataReferenceStack,
  popDataReferenceStack,
  pushDataReferenceStack,
  onClose,
  onBack,
}: {
  dataReferenceStack: DataReferenceItem[];
  popDataReferenceStack: () => void;
  pushDataReferenceStack: (item: DataReferenceItem) => void;
  onClose?: () => void;
  onBack?: () => void;
}) => {
  if (dataReferenceStack.length) {
    const page = dataReferenceStack[dataReferenceStack.length - 1];
    const Pane = PANES[page.type] as ComponentType<
      DataReferencePaneProps<typeof page>
    >;
    return (
      <Pane
        {...page}
        onItemClick={pushDataReferenceStack}
        onClose={onClose}
        onBack={popDataReferenceStack}
      />
    );
  } else {
    return (
      <MainPane
        onItemClick={pushDataReferenceStack}
        onClose={onClose}
        onBack={onBack}
      />
    );
  }
};
