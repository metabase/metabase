import type { MetabaseUser } from "embedding-sdk/types/user";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

export const useCurrentUser: () => MetabaseUser | null = () =>
  useSelector(getUser);
