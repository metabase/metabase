import type { Location } from "history";
import { useContext } from "react";

import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { DependencyGraph } from "../../components/DependencyGraph";
import { isSameNode } from "../../components/DependencyGraph/utils";

import { parseDependencyEntry } from "./utils";

export type DependencyGraphPageQuery = {
  id?: string;
  type?: string;
};

type DependencyGraphPageProps = {
  location?: Location<DependencyGraphPageQuery>;
};

export function DependencyGraphPage({ location }: DependencyGraphPageProps) {
  const entry = parseDependencyEntry(location?.query?.id, location?.query.type);
  const { defaultEntry, baseUrl } = useContext(
    PLUGIN_DEPENDENCIES.DependencyGraphPageContext,
  );
  const withEntryPicker =
    defaultEntry == null || (entry != null && !isSameNode(entry, defaultEntry));

  return (
    <DependencyGraph
      entry={entry ?? defaultEntry}
      getGraphUrl={(entry) => Urls.dependencyGraph({ entry, baseUrl })}
      withEntryPicker={withEntryPicker}
    />
  );
}
