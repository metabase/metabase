import type { Location } from "history";
import { useContext } from "react";

import { skipToken } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Stack } from "metabase/ui";
import { useGetDependencyGraphQuery } from "metabase-enterprise/api";

import { DependencyGraph } from "../../components/DependencyGraph";
import { isSameNode } from "../../utils";

import S from "./DependencyGraphPage.module.css";
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

  const {
    data: graph,
    isFetching,
    error,
  } = useGetDependencyGraphQuery(entry ?? defaultEntry ?? skipToken);

  return (
    <Stack h="100%">
      <DependencyGraph
        entry={entry ?? defaultEntry}
        graph={graph}
        isFetching={isFetching}
        error={error}
        getGraphUrl={(entry) => Urls.dependencyGraph({ entry, baseUrl })}
        withEntryPicker={withEntryPicker}
        headerRightSide={
          baseUrl === undefined ? (
            <AppSwitcher className={S.appSwitcher} />
          ) : null
        }
      />
    </Stack>
  );
}
