import { useEffect, useRef, useState } from "react";
import type { UserListResult } from "metabase-types/api";
import { UserApi } from "metabase/services";

export const useUserRecipients = (() => {
  const userListPromise = useRef<Promise<UserListResult[]> | null>(null);

  return _useUserRecipients;

  function _useUserRecipients() {
    const [data, setData] = useState<UserListResult[] | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
      if (!userListPromise.current) {
        userListPromise.current = UserApi.list()
          .then(response => {
            return response.data;
          })
          .catch(err => {
            setError(err);
            userListPromise.current = null;
            throw err;
          });
      }

      setLoading(true);
      userListPromise.current
        .then(apiData => {
          setData(apiData);
          setLoading(false);
        })
        .catch(err => {
          setError(err);
          setLoading(false);
        });
    }, []);

    return { data, loading, error };
  }
})();
