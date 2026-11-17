import { useListCollectionItemsQuery } from "metabase/api";
import { Navigate } from "metabase/router";
import { Center, Loader } from "metabase/ui";

// Prototype landing page: send the user to the first dashboard in the
// "Our analytics" (root) collection, falling back to the collection itself.
export function ProtoHome() {
  const { data, isLoading } = useListCollectionItemsQuery({
    id: "root",
    models: ["dashboard"],
    limit: 1,
  });

  if (isLoading) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    );
  }

  const firstDashboard = data?.data?.[0];
  return (
    <Navigate
      to={
        firstDashboard ? `/dashboard/${firstDashboard.id}` : "/collection/root"
      }
      replace
    />
  );
}
