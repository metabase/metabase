import type { ReactNode } from "react";

import { skipToken } from "metabase/api";
import { BenchPaneHeader } from "metabase/bench/components/BenchPaneHeader";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Flex } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";

import { TransformTabs } from "../../components/TransformTabs";

export type TransformDependenciesPageParams = {
  transformId: string;
};

type TransformDependenciesPageProps = {
  params?: TransformDependenciesPageParams;
  children?: ReactNode;
};

export function TransformDependenciesPage({
  params,
  children,
}: TransformDependenciesPageProps) {
  const id = Urls.extractEntityId(params?.transformId);
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(id ?? skipToken);

  if (id == null || transform == null || isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <Flex direction="column" h="100%">
      <BenchPaneHeader
        title={<TransformTabs transform={transform} />}
        withBorder
      />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: Urls.transformDependencies(transform.id),
          defaultEntry: { id: transform.id, type: "transform" },
        }}
      >
        {children}
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </Flex>
  );
}
