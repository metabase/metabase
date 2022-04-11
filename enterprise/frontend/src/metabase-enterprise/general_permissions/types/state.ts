import { State } from "metabase-types/store";
import { GeneralPermissions } from "./permissions";
import { UserWithGeneralPermissions } from "./user";

export interface GeneralPermissionsState extends State {
  currentUser: UserWithGeneralPermissions;
  plugins: {
    generalPermissionsPlugin: {
      generalPermissions: GeneralPermissions;
      originalGeneralPermissions: GeneralPermissions;
    };
  };
}
