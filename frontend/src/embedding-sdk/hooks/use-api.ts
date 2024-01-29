import { useMemo } from "react";
import { Api } from "metabase/lib/api";

export const useApi = ({ apiUrl }: { apiUrl: string; apiKey: string }) => {
  const instance = useMemo(() => new Api(apiUrl), [apiUrl]);
  const { GET, POST, PUT, DELETE } = instance;

  return { GET, POST, PUT, DELETE };
};
