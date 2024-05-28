import type { ReactNode } from "react";

import DeprecationNotice from "../../containers/DeprecationNotice";
import { SettingsCommandPaletteActions } from "../SettingsCommandPaletteActions";

export interface AdminAppProps {
  children?: ReactNode;
}

const AdminApp = ({ children }: AdminAppProps): JSX.Element => {
  return (
    <>
      <DeprecationNotice />
      <SettingsCommandPaletteActions />
      {children}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AdminApp;
