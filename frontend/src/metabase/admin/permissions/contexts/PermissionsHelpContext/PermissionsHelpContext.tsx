import {
  type Dispatch,
  type SetStateAction,
  createContext,
  useContext,
  useState,
} from "react";

import { Outlet } from "metabase/router";

const PermissionsHelpContext = createContext<
  [boolean, Dispatch<SetStateAction<boolean>>] | null
>(null);

export function PermissionsHelpProvider() {
  const helpState = useState(false);
  return (
    <PermissionsHelpContext.Provider value={helpState}>
      <Outlet />
    </PermissionsHelpContext.Provider>
  );
}

export function usePermissionsHelp() {
  const localHelpState = useState(false);
  return useContext(PermissionsHelpContext) ?? localHelpState;
}
