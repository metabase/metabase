import type { State } from "metabase-types/store";

import type { ApplicationPermissions } from "./permissions";
import type { UserWithApplicationPermissions } from "./user";

export interface ApplicationPermissionsState extends State {
  currentUser: UserWithApplicationPermissions;
  plugins: {
    applicationPermissionsPlugin: {
      applicationPermissions: ApplicationPermissions;
      originalApplicationPermissions: ApplicationPermissions;
    };
  };
}
