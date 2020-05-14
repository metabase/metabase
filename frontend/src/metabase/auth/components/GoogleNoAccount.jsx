import React from "react";
import { t } from "ttag";
import AuthScene from "./AuthScene";
import LogoIcon from "metabase/components/LogoIcon";
import BackToLogin from "./BackToLogin";

const GoogleNoAccount = () => (
  <div className="full-height flex flex-column flex-full md-layout-centered">
    <div className="wrapper">
      <div className="Login-wrapper Grid  Grid--full md-Grid--1of2">
        <div className="Grid-cell flex layout-centered text-brand">
          <LogoIcon className="Logo my4 sm-my0" height={65} />
        </div>
        <div className="Grid-cell text-centered bg-white bordered rounded shadowed p4">
          <h3 className="mt4 mb2">{t`No Metabase account exists for this Google account.`}</h3>
          <p className="mb4 ml-auto mr-auto" style={{ maxWidth: 360 }}>
            {t`You'll need an administrator to create a Metabase account before you can use Google to log in.`}
          </p>

          <BackToLogin />
        </div>
      </div>
    </div>
    <AuthScene />
  </div>
);

export default GoogleNoAccount;
