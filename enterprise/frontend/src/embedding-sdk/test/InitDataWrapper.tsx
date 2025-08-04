import type { MetabaseProviderProps } from "embedding-sdk";
import { useInitData } from "embedding-sdk/hooks";
import { useSdkStore } from "embedding-sdk/store";

export const InitDataWrapper = ({
  authConfig,
}: Pick<MetabaseProviderProps, "authConfig">) => {
  const reduxStore = useSdkStore();

  useInitData({ reduxStore, authConfig });

  return null;
};
