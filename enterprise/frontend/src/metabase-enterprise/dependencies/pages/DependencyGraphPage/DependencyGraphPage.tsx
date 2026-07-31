import { useContext } from "react";

import { skipToken } from "metabase/api";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useSearchParams } from "metabase/router";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useGetDependencyGraphQuery } from "metabase-enterprise/api";

import { DependencyGraph } from "../../components/DependencyGraph";
import { isSameNode } from "../../utils";

import S from "./DependencyGraphPage.module.css";
import { parseDependencyEntry } from "./utils";

export function DependencyGraphPage() {
  const [searchParams] = useSearchParams();
  const entry = parseDependencyEntry(
    searchParams.get("id") ?? undefined,
    searchParams.get("type") ?? undefined,
  );
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
