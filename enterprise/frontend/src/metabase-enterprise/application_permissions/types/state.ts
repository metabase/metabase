import type { State } from "metabase-types/store";

import type { ApplicationPermissions } from "./permissions";

export interface ApplicationPermissionsState extends State {
  plugins: {
    applicationPermissionsPlugin: {
      applicationPermissions: ApplicationPermissions;
      originalApplicationPermissions: ApplicationPermissions;
    };
  };
}
