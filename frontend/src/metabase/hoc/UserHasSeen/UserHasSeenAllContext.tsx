import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useKeyPressEvent } from "react-use";

import { useUserKeyValue } from "metabase/hooks/use-user-key-value";

export interface UserHasSeenAllContextProps {
  upsertBadge: ({ key, value }: { key: string; value: boolean }) => void;
  removeBadge: ({ key }: { key: string }) => void;
  handleOpen: () => void;
  hasSeenAll: boolean;
}

export const UserHasSeenAllContext =
  createContext<UserHasSeenAllContextProps | null>(null);

export const UserHasSeenAllProvider = ({
  menuKey,
  children,
}: PropsWithChildren<{ menuKey: string }>) => {
  const contextValue = useUserHasSeenAll(menuKey);

  return (
    <UserHasSeenAllContext.Provider value={contextValue}>
      {children}
    </UserHasSeenAllContext.Provider>
  );
};

const useUserHasSeenAll = (menuKey: string) => {
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

  useKeyPressEvent("q", () => setSeenBadges([]));

  const unseenBadges = useMemo(
    () =>
      badges.filter(([key]) => !seenBadges.includes(key)).map(([key]) => key),
    [badges, seenBadges],
  );

  const handleOpen = useCallback(() => {
    if (!unseenBadges.every(b => seenBadges.includes(b))) {
      setSeenBadges([...seenBadges, ...unseenBadges]);
    }
  }, [unseenBadges, seenBadges, setSeenBadges]);

  const hasSeenAll = unseenBadges.length === 0;

  return useMemo(
    () => ({
      upsertBadge,
      removeBadge,
      hasSeenAll,
      handleOpen,
    }),
    [hasSeenAll, upsertBadge, removeBadge, handleOpen],
  );
};
