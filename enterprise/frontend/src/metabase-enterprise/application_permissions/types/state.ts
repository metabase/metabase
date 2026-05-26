import type { State } from "metabase/redux/store";

import type { ApplicationPermissions } from "./permissions";

export interface ApplicationPermissionsState extends State {
  plugins: {
    applicationPermissionsPlugin: {
      applicationPermissions: ApplicationPermissions;
      originalApplicationPermissions: ApplicationPermissions;
    };
  };
}
