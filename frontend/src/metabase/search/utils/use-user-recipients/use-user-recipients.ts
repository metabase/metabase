import { useEffect, useState } from "react";
import type { UserListResult } from "metabase-types/api";
import { UserApi } from "metabase/services";

// Need to keep outside the hook scope so that we can cache the promise
let userListPromise: Promise<UserListResult[]> | null = null;

export const useUserRecipients = () => {
  const [data, setData] = useState<UserListResult[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userListPromise) {
      userListPromise = UserApi.list()
        .then(response => {
          if (response.status !== 200) {
            throw new Error("Failed to fetch users");
          }
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
      })
      .catch(err => {
        setError(err);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      userListPromise = null;
    };
  }, []);

  return { data, loading, error };
};
