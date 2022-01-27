import React, { ReactNode } from "react";
import DeprecationNotice from "../../containers/DeprecationNotice";

export interface AdminAppProps {
  children?: ReactNode;
}

const AdminApp = ({ children }: AdminAppProps): JSX.Element => {
  return (
    <>
      <DeprecationNotice />
      {children}
    </>
  );
};

export default AdminApp;
