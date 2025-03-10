import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useMemo,
  useState,
} from "react";

import { useUserKeyValue } from "metabase/hooks/use-user-key-value";

export interface IndicatorMenuContextProps {
  upsertBadge: ({ key, value }: { key: string; value: boolean }) => void;
  removeBadge: ({ key }: { key: string }) => void;
  handleOpen: () => void;
  showIndicator: boolean;
}

export const IndicatorMenuContext =
  createContext<IndicatorMenuContextProps | null>(null);

export const IndicatorMenuProvider = ({
  menuKey,
  children,
}: PropsWithChildren<{ menuKey: string }>) => {
  const contextValue = useIndicatorMenu(menuKey);

  return (
    <IndicatorMenuContext.Provider value={contextValue}>
      {children}
    </IndicatorMenuContext.Provider>
  );
};

const useIndicatorMenu = (menuKey: string) => {
  const [badges, setBadges] = useState<[string, boolean][]>([]);

  const upsertBadge = useCallback(
    ({ value, key }: { value: boolean; key: string }) => {
      setBadges(s => [...s.filter(([k]) => k !== key), [key, value]]);
    },
    [],
  );
  const removeBadge = useCallback(({ key }: { key: string }) => {
    setBadges(s => [...s.filter(([k]) => k !== key)]);
  }, []);

  const { value: seenBadges, setValue: setSeenBadges } = useUserKeyValue({
    namespace: "indicator-menu",
    key: menuKey,
    defaultValue: [],
  });

  const unseenBadges = useMemo(
    () =>
      badges.filter(([key]) => !seenBadges.includes(key)).map(([key]) => key),
    [badges, seenBadges],
  );

  const handleOpen = useCallback(() => {
    if (!unseenBadges.every(b => seenBadges.includes(b))) {
      setSeenBadges(badges.map(([k]) => k));
    }
  }, [unseenBadges, badges, seenBadges, setSeenBadges]);

  const showIndicator = unseenBadges.length > 0;

  return useMemo(
    () => ({
      upsertBadge,
      removeBadge,
      showIndicator,
      handleOpen,
    }),
    [showIndicator, upsertBadge, removeBadge, handleOpen],
  );
};
