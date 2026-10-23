import { useParams } from "metabase/router";
import { useGetDataAppQuery } from "metabase-enterprise/api";

export function useRouteDataApp() {
  const { name = "" } = useParams<{ name: string }>();
  const { data: app, isLoading, error } = useGetDataAppQuery(name);
  return { app, isLoading, error };
}
