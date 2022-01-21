import React, { Fragment, ReactNode } from "react";

export interface AuthProps {
  children?: ReactNode;
}

const Auth = ({ children }: AuthProps): JSX.Element => {
  return <Fragment>{children}</Fragment>;
};

export default Auth;
