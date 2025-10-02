import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getLoginStatus } from "embedding-sdk-bundle/store/selectors";

export const useMetabaseAuthStatus = () => useSdkSelector(getLoginStatus);
