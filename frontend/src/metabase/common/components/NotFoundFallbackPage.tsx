import { useMount } from "react-use";

import { useLazyGetCurrentUserQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { useDispatch } from "metabase/redux";
import { replace } from "metabase/router";

export const NotFoundFallbackPage = () => {
  const dispatch = useDispatch();
  // A 404 can mean the session expired; re-check who we are and bounce to
  // login if the current user can't be fetched.
  const [refetchCurrentUser] = useLazyGetCurrentUserQuery();

  useMount(() => {
    async function refresh() {
      const { isError } = await refetchCurrentUser();
      if (isError) {
        dispatch(replace("/auth/login"));
      }
    }
    refresh();
  });

  return <NotFound />;
};
