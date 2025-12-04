import type { ReactNode } from "react";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Center, Flex } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";

import { TransformHeader } from "../../components/TransformHeader";

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
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <Flex direction="column" h="100%">
      <TransformHeader transform={transform} />
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
