import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useKeyPressEvent } from "react-use";

import { useUserKeyValue } from "metabase/hooks/use-user-key-value";

const EMPTY_ARRAY: string[] = [];

export interface UserHasSeenAllContextProps {
  upsertBadge: ({ key, value }: { key: string; value: boolean }) => void;
  removeBadge: ({ key }: { key: string }) => void;
  handleUpdate: () => void;
  hasSeenAll: boolean;
}

export const UserHasSeenAllContext =
  createContext<UserHasSeenAllContextProps | null>(null);

export const UserHasSeenAllProvider = ({
  id,
  children,
}: PropsWithChildren<{ id: string }>) => {
  const contextValue = useUserHasSeenAll(id);

  return (
    <UserHasSeenAllContext.Provider value={contextValue}>
      {children}
    </UserHasSeenAllContext.Provider>
  );
};

const useUserHasSeenAll = (id: string) => {
  const [badges, setBadges] = useState<[string, boolean][]>([]);

  const upsertBadge = useCallback(
    ({ value, key }: { value: boolean; key: string }) => {
      setBadges((s) => {
        const badgeAlreadyInArray =
          s.findIndex(([k, v]) => k === key && v === value) >= 0;
        if (badgeAlreadyInArray) {
          return s;
        }

        return [...s.filter(([k]) => k !== key), [key, value]];
      });
    },
    [],
  );
  const removeBadge = useCallback(({ key }: { key: string }) => {
    setBadges((s) => [...s.filter(([k]) => k !== key)]);
  }, []);

  const { value: seenBadges, setValue: setSeenBadges } = useUserKeyValue({
    namespace: "indicator-menu",
    key: id,
    defaultValue: EMPTY_ARRAY,
  });

  useKeyPressEvent("q", () => setSeenBadges?.([]));

  const unseenBadges = useMemo(() => {
    return badges
      .filter(([key]) => !seenBadges.includes(key))
      .map(([key]) => key);
  }, [badges, seenBadges]);

  const handleUpdate = useCallback(() => {
    if (!unseenBadges.every((b) => seenBadges.includes(b))) {
      setSeenBadges?.([...seenBadges, ...unseenBadges]);
    }
  }, [unseenBadges, seenBadges, setSeenBadges]);

  const hasSeenAll = unseenBadges.length === 0;

  return useMemo(
    () => ({
      upsertBadge,
      removeBadge,
      hasSeenAll,
      handleUpdate,
    }),
    [hasSeenAll, upsertBadge, removeBadge, handleUpdate],
  );
};
