import React, { ReactNode, useEffect } from "react";
import DeprecationNotice from "../../containers/DeprecationNotice";

export interface AdminAppProps {
  children?: ReactNode;
}

const AdminApp = ({ children }: AdminAppProps): JSX.Element => {
  useEffect(() => {
    const b = document.querySelector("body");
    if (b) {
      b.classList.add("Admin");
    }
    return () => b.classList.remove("Admin");
  }, []);
  return (
    <>
      <DeprecationNotice />
      {children}
    </>
  );
};

export default AdminApp;
