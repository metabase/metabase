import { useParams } from "metabase/router";
import { useGetDataAppBySlugQuery } from "metabase-enterprise/api";

export function useRouteDataApp() {
  const { name = "" } = useParams<{ name: string }>();
  const { data: app, isLoading, error } = useGetDataAppBySlugQuery(name);
  return { app, isLoading, error };
}
