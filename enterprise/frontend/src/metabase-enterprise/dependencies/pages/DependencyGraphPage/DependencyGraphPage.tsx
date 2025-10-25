import * as Urls from "metabase/lib/urls";

import { DependencyGraph } from "../../components/DependencyGraph";
import { parseDependencyEntry } from "../../utils";

export type DependencyGraphPageParams = {
  entryId?: string;
  entryType?: string;
};

type DependencyGraphPageProps = {
  params?: DependencyGraphPageParams;
};

export function DependencyGraphPage({ params }: DependencyGraphPageProps) {
  const entry = parseDependencyEntry(params?.entryId, params?.entryType);
  return (
    <DependencyGraph
      entry={entry}
      getGraphUrl={Urls.dependencyGraph}
      withEntryPicker
    />
  );
}
