import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { UpgradeModal } from "./UpgradeModal";

interface UpgradeModalContextValue {
  openUpgradeModal: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextValue | null>(
  null,
);

interface UpgradeModalProviderProps {
  children: React.ReactNode;
}

export function UpgradeModalProvider({ children }: UpgradeModalProviderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const openUpgradeModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const contextValue = useMemo(
    () => ({ openUpgradeModal }),
    [openUpgradeModal],
  );

  return (
    <UpgradeModalContext.Provider value={contextValue}>
      {children}
      <UpgradeModal opened={isOpen} onClose={closeModal} />
    </UpgradeModalContext.Provider>
  );
}

export function useUpgradeModal() {
  const context = useContext(UpgradeModalContext);
  if (!context) {
    throw new Error("useUpgradeModal must be used within UpgradeModalProvider");
  }
  return context;
}
