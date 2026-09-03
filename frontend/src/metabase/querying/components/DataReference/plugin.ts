import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

import type { DataReferenceLibraryItem, DataReferencePaneProps } from "./types";

type LibraryPaneProps = DataReferencePaneProps<DataReferenceLibraryItem>;

export const PLUGIN_DATA_REFERENCE: {
  LibraryPane: ComponentType<LibraryPaneProps>;
} = {
  LibraryPane: PluginPlaceholder<LibraryPaneProps>,
};
