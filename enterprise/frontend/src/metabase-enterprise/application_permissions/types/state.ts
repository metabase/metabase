import { State } from "metabase-types/store";
import { ApplicationPermissions } from "./permissions";
import { UserWithApplicationPermissions } from "./user";

export interface ApplicationPermissionsState extends State {
  currentUser: UserWithApplicationPermissions;
  plugins: {
    applicationPermissionsPlugin: {
      applicationPermissions: ApplicationPermissions;
      originalApplicationPermissions: ApplicationPermissions;
    };
  };
}
