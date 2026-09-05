import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import { definePluginSlot } from "metabase/plugins/slot";

import type { DataReferenceLibraryItem, DataReferencePaneProps } from "./types";

type LibraryPaneProps = DataReferencePaneProps<DataReferenceLibraryItem>;

type DataReferencePlugin = {
  LibraryPane: ComponentType<LibraryPaneProps>;
};

export const PLUGIN_DATA_REFERENCE = definePluginSlot(
  (): DataReferencePlugin => ({
    LibraryPane: PluginPlaceholder<LibraryPaneProps>,
  }),
);
