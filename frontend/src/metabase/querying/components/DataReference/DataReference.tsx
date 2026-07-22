import type { ComponentType } from "react";

import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { DatabaseId } from "metabase-types/api";

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
  databaseId,
}: {
  dataReferenceStack: DataReferenceItem[];
  popDataReferenceStack: () => void;
  pushDataReferenceStack: (item: DataReferenceItem) => void;
  onClose?: () => void;
  onBack?: () => void;
  databaseId?: DatabaseId;
}) => {
  if (dataReferenceStack.length) {
    const page = dataReferenceStack[dataReferenceStack.length - 1];

    if (page.type === "library") {
      return (
        <PLUGIN_LIBRARY.DataReferenceLibraryPane
          {...page}
          onItemClick={pushDataReferenceStack}
          onClose={onClose}
          onBack={popDataReferenceStack}
          queryDatabaseId={databaseId}
        />
      );
    }
    // Unjustified type cast. FIXME
    const Pane = PANES[page.type] as ComponentType<
      DataReferencePaneProps<typeof page>
    >;
    return (
      <Pane
        {...page}
        onItemClick={pushDataReferenceStack}
        onClose={onClose}
        onBack={popDataReferenceStack}
        queryDatabaseId={databaseId}
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
