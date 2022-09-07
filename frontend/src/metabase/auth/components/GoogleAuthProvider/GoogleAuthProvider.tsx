import React, { ReactNode } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { connect } from "react-redux";
import { State } from "metabase-types/store";

export interface GoogleAuthProviderProps {
  isEnabled?: boolean;
  clientId?: string | null;
  children?: ReactNode;
}

const GoogleAuthProvider = ({
  isEnabled,
  clientId,
  children,
}: GoogleAuthProviderProps): JSX.Element => {
  return isEnabled && clientId ? (
    <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
  ) : (
    <>{children}</>
  );
};

const mapStateToProps = (state: State) => ({
  isEnabled: state.settings?.values["ga-enabled"],
  clientId: state.settings?.values["google-auth-client-id"],
});

export default connect(mapStateToProps)(GoogleAuthProvider);
