import { createThunkAction } from "metabase/lib/redux";
import { reloadSettings } from "metabase/admin/settings/settings";
import { Dispatch } from "metabase-types/store";
import { trackLoginSSO } from "./analytics";
import { getSSOUrl } from "./utils";
import { JwtApi } from "./services";

export const LOGIN_SSO = "metabase-enterprise/auth/LOGIN_SSO";
export const loginSSO = createThunkAction(
  LOGIN_SSO,
  (redirectUrl?: string) => async () => {
    trackLoginSSO();
    window.location.href = getSSOUrl(redirectUrl);
  },
);

export const DELETE_JWT_SETTINGS =
  "metabase-enterprise/auth/DELETE_JWT_SETTINGS";
export const deleteJwtSettings = createThunkAction(
  DELETE_JWT_SETTINGS,
  function () {
    return async function (dispatch: Dispatch) {
      await JwtApi.deleteSettings();
      await dispatch(reloadSettings());
    };
  },
);
