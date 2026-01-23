import type { Location } from "history";
import { useContext } from "react";

import * as Urls from "metabase/lib/urls";
import { ProfileLink } from "metabase/nav/components/ProfileLink/ProfileLink";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Stack } from "metabase/ui";

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

  return (
    <Stack h="100%">
      <DependencyGraph
        entry={entry ?? defaultEntry}
        getGraphUrl={(entry) => Urls.dependencyGraph({ entry, baseUrl })}
        withEntryPicker={withEntryPicker}
      />
      <ProfileLink className={S.ProfileLink} />
    </Stack>
  );
}
