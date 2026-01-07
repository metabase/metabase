import type { Location } from "history";
import { useContext } from "react";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getUserIsAdminButNotAnalyst } from "metabase/selectors/user";
import { Stack } from "metabase/ui";
import { AnalystFeaturePreviewWrapper } from "metabase-enterprise/data-studio/common/components/AnalystFeaturePreviewWrapper";

import { DependencyGraph } from "../../components/DependencyGraph";
import { isSameNode } from "../../components/DependencyGraph/utils";

import { DependencyGraphPagePreview } from "./DependencyGraphPagePreview";
import { parseDependencyEntry } from "./utils";

export type DependencyGraphPageQuery = {
  id?: string;
  type?: string;
};

type DependencyGraphPageProps = {
  location?: Location<DependencyGraphPageQuery>;
};

export function DependencyGraphPage({ location }: DependencyGraphPageProps) {
  const isPreviewMode = useSelector(getUserIsAdminButNotAnalyst);

  if (isPreviewMode) {
    return (
      <AnalystFeaturePreviewWrapper feature="dependencies">
        <DependencyGraphPagePreview />
      </AnalystFeaturePreviewWrapper>
    );
  }

  return <DependencyGraphPageContent location={location} />;
}

function DependencyGraphPageContent({
  location,
}: DependencyGraphPageProps) {
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
    </Stack>
  );
}
