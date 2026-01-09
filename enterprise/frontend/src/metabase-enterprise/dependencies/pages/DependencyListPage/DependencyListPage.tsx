import type { Location } from "history";
import { replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";

import { DependencyList } from "../../components/DependencyList";

import type { DependencyListQueryParams } from "./types";
import { parseParams } from "./utils";

type DependencyListPageProps = {
  location: Location<DependencyListQueryParams>;
};

export function UnreferencedDependencyListPage({
  location,
}: DependencyListPageProps) {
  const params = parseParams(location.query);
  const dispatch = useDispatch();

  const handleParamsChange = (params: Urls.DependencyListParams) => {
    dispatch(replace(Urls.unreferencedDependencies(params)));
  };

  return (
    <DependencyList
      mode="unreferenced"
      params={params}
      onParamsChange={handleParamsChange}
    />
  );
}
