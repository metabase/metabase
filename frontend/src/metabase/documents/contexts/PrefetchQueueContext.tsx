import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
} from "react";

import { useIsPrefetchAllowed } from "metabase/common/hooks/use-is-prefetch-allowed";
import {
  type PrefetchQueue,
  PrefetchQueueStore,
} from "metabase/documents/utils/prefetch-queue";

const PrefetchQueueContext = createContext<PrefetchQueue | null>(null);

export function PrefetchQueueProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new PrefetchQueueStore(), []);
  const isAllowed = useIsPrefetchAllowed();

  useEffect(() => {
    store.setEnabled(isAllowed);
  }, [store, isAllowed]);

  useEffect(() => {
    return () => store.destroy();
  }, [store]);

  return (
    <PrefetchQueueContext.Provider value={store}>
      {children}
    </PrefetchQueueContext.Provider>
  );
}

export function usePrefetchQueue(): PrefetchQueue | null {
  return useContext(PrefetchQueueContext);
}
