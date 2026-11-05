import type { ComponentType } from "react";

import { definePluginSlot } from "metabase/plugins";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

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
