import { useEffect } from "react";
import { replace } from "react-router-redux";

import { useListCollectionItemsQuery } from "metabase/api";
import { useDispatch } from "metabase/redux";
import { Center, Loader } from "metabase/ui";

// Prototype landing page: send the user to the first dashboard in the
// "Our analytics" (root) collection, falling back to the collection itself.
export function ProtoHome() {
  const dispatch = useDispatch();
  const { data, isLoading } = useListCollectionItemsQuery({
    id: "root",
    models: ["dashboard"],
    limit: 1,
  });

  useEffect(() => {
    if (isLoading) {
      return;
    }
    const firstDashboard = data?.data?.[0];
    if (firstDashboard) {
      dispatch(replace(`/dashboard/${firstDashboard.id}`));
    } else {
      dispatch(replace("/collection/root"));
    }
  }, [isLoading, data, dispatch]);

  return (
    <Center h="100%">
      <Loader />
    </Center>
  );
}
