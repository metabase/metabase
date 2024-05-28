import { AdminEmbedMenu } from "metabase/dashboard/components/EmbedMenu/AdminEmbedMenu";
import type { EmbedMenuProps } from "metabase/dashboard/components/EmbedMenu/types";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

import { NonAdminEmbedMenu } from "./NonAdminEmbedMenu";

export const EmbedMenu = (props: EmbedMenuProps) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );

  const isEmbeddingEnabled = useSelector(state =>
    getSetting(state, "enable-embedding"),
  );

  if (isEmbeddingEnabled == null || isPublicSharingEnabled == null) {
    return null;
  }

  if (isAdmin) {
    return <AdminEmbedMenu {...props} />;
  }
  return <NonAdminEmbedMenu {...props} />;
};
