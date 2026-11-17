import { useParams } from "metabase/router";
import { useGetDataAppQuery } from "metabase-enterprise/api";

export function useRouteDataApp() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { data: app, isLoading, error } = useGetDataAppQuery(slug);
  return { app, isLoading, error };
}
