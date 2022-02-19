import {
  DATA_ACCESS_IS_REQUIRED,
  UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
} from "metabase/admin/permissions/constants/messages";
import { DOWNLOAD_PERMISSION_OPTIONS } from "./constants";

export const getFeatureLevelDataPermissions = (isAdminGroup: boolean) => {
  return [
    {
      name: "download",
      isDisabled: false,
      disabledTooltip: isAdminGroup
        ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
        : DATA_ACCESS_IS_REQUIRED,
      isHighlighted: isAdminGroup,
      value: "all",
      options: [
        DOWNLOAD_PERMISSION_OPTIONS.none,
        DOWNLOAD_PERMISSION_OPTIONS.limited,
        DOWNLOAD_PERMISSION_OPTIONS.full,
      ],
    },
  ];
};
