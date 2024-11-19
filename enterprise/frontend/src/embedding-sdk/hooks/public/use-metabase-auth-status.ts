import { useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus } from "embedding-sdk/store/selectors";

export const useMetabaseAuthStatus = () => useSdkSelector(getLoginStatus);
