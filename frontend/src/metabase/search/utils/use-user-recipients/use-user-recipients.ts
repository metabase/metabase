import { useEffect, useState } from "react";
import type { UserListResult } from "metabase-types/api";
import { UserApi } from "metabase/services";

let userListPromise: Promise<UserListResult[]> | null = null;

export const useUserRecipients = () => {
  const [data, setData] = useState<UserListResult[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userListPromise) {
      userListPromise = UserApi.list()
        .then(response => {
          return response.data;
        })
        .catch(err => {
          setError(err);
          userListPromise = null;
          throw err;
        });
    }

    setLoading(true);
    userListPromise
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
};
