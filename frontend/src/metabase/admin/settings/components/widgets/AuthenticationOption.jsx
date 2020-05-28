import React from "react";
import { Link } from "react-router";
import { t } from "ttag";

const AuthenticationOption = ({ setting, settingValues }) => (
  <div className="bordered rounded shadowed bg-white p4" style={{ width: 500 }}>
    <div className="flex align-center">
      <h2>{setting.authName}</h2>
      {setting.authEnabled && setting.authEnabled(settingValues) && (
        <div className="ml-auto flex align-center text-uppercase text-success">
          <div
            className="bg-success circular mr1"
            style={{ width: 10, height: 10 }}
          />
          {t`Active`}
        </div>
      )}
    </div>
    <p>{setting.authDescription}</p>
    <Link
      className="Button"
      to={`/admin/settings/authentication/${setting.authType}`}
    >
      {t`Configure`}
    </Link>
  </div>
);

export default AuthenticationOption;
