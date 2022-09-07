import React, { ReactNode } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { connect } from "react-redux";
import { State } from "metabase-types/store";

export interface GoogleAuthProviderProps {
  clientId?: string | null;
  children?: ReactNode;
}

const GoogleAuthProvider = ({
  clientId,
  children,
}: GoogleAuthProviderProps): JSX.Element => {
  return clientId ? (
    <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
  ) : (
    <>{children}</>
  );
};

const mapStateToProps = (state: State) => ({
  clientId: state.settings?.values["google-auth-client-id"],
});

export default connect(mapStateToProps)(GoogleAuthProvider);
