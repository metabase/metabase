import { useMount } from "react-use";

import { useLazyGetCurrentUserQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { useNavigate } from "metabase/router";

export const NotFoundFallbackPage = () => {
  const navigate = useNavigate();
  // A 404 can mean the session expired.
  // Re-check who we are and bounce to login if the current user can't be fetched.
  const [refetchCurrentUser] = useLazyGetCurrentUserQuery();

  useMount(() => {
    async function refresh() {
      const { isError } = await refetchCurrentUser();
      if (isError) {
        navigate("/auth/login", { replace: true });
      }
    }
    refresh();
  });

  return <NotFound />;
};
