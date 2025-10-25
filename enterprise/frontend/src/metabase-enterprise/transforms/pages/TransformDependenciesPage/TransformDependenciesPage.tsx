import { skipToken } from "metabase/api";
import { BenchPaneHeader } from "metabase/bench/components/BenchPaneHeader";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Flex } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import { TransformTabs } from "metabase-enterprise/transforms/components/TransformTabs";

export type TransformDependenciesPageParams = {
  transformId: string;
  entryId?: string;
  entryType?: string;
};

type TransformDependenciesPageProps = {
  params?: TransformDependenciesPageParams;
};

export function TransformDependenciesPage({
  params,
}: TransformDependenciesPageProps) {
  const id = Urls.extractEntityId(params?.transformId);
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(id ?? skipToken);
  const entry = PLUGIN_DEPENDENCIES.parseDependencyEntry(
    params?.entryId,
    params?.entryType,
  );

  if (id == null || transform == null || isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <Flex direction="column" h="100%">
      <BenchPaneHeader
        title={<TransformTabs transform={transform} />}
        withBorder
      />
      <PLUGIN_DEPENDENCIES.DependencyGraph
        entry={entry ?? { id, type: "transform" }}
        getGraphUrl={(entry) => Urls.transformDependencyGraph(id, entry)}
        withEntryPicker={entry != null}
      />
    </Flex>
  );
}
