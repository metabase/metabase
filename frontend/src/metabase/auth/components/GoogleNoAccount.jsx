import React from "react";

import AuthScene from "./AuthScene.jsx";
import LogoIcon from "metabase/components/LogoIcon.jsx";

const GoogleNoAccount = () =>
    <div className="full-height bg-white flex flex-column flex-full md-layout-centered">
        <div className="wrapper">
            <div className="Login-wrapper Grid  Grid--full md-Grid--1of2">
                <div className="Grid-cell flex layout-centered text-brand">
                    <LogoIcon className="Logo my4 sm-my0" width={66} height={85} />
                </div>
                <div className="Grid-cell bordered rounded shadowed">
                    <h3 className="Login-header Form-offset mt4">
                        No Metabase account exists for this Google account.
                    </h3>
                    <p className="Form-offset mb4 mr4">
                        You'll need an administrator to create a Metabase account before
                        you can use Google to log in.
                    </p>
                </div>
            </div>
        </div>
        <AuthScene />
    </div>

export default GoogleNoAccount;
