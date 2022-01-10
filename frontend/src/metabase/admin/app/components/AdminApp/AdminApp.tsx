import React, { ReactNode } from "react";
import DeprecationBanner from "../../containers/DeprecationBanner";

export interface AdminAppProps {
  children?: ReactNode;
}

const AdminApp = ({ children }: AdminAppProps): JSX.Element => {
  return (
    <div>
      <DeprecationBanner />
      {children}
    </div>
  );
};

export default AdminApp;
