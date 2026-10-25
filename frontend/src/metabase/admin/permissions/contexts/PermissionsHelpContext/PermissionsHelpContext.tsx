import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { Outlet } from "metabase/router";

type PermissionsHelpContextValue = {
  isHelpOpen: boolean;
  toggleHelp: () => void;
};

const PermissionsHelpContext =
  createContext<PermissionsHelpContextValue | null>(null);

function useHelpState(): PermissionsHelpContextValue {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const toggleHelp = useCallback(() => setIsHelpOpen((isOpen) => !isOpen), []);
  return useMemo(() => ({ isHelpOpen, toggleHelp }), [isHelpOpen, toggleHelp]);
}

export function PermissionsHelpProvider() {
  const value = useHelpState();
  return (
    <PermissionsHelpContext.Provider value={value}>
      <Outlet />
    </PermissionsHelpContext.Provider>
  );
}

export function usePermissionsHelp() {
  const context = useContext(PermissionsHelpContext);
  const localState = useHelpState();
  return context ?? localState;
}
