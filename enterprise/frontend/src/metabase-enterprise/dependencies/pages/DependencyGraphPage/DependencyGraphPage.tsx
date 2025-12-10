import type { Location } from "history";
import { useContext } from "react";
import { t } from "ttag";

import S from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Box, Stack, Title } from "metabase/ui";

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
    <Stack h="100%">
      <Box p="lg" className={S.borderBottom}>
        <Title order={4}>{t`Dependency graph`}</Title>
      </Box>
      <DependencyGraph
        entry={entry ?? defaultEntry}
        getGraphUrl={(entry) => Urls.dependencyGraph({ entry, baseUrl })}
        withEntryPicker={withEntryPicker}
      />
    </Stack>
  );
}
