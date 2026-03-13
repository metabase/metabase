import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { TableColumnOrderSetting } from "metabase-types/api";

type ColumnInfo = { id: string; name: string };

type TransientColumnVisibilityContextValue = {
  allColumns: ColumnInfo[];
  hiddenColumnIds: Set<string>;
  setAllColumns: (columns: ColumnInfo[]) => void;
  hideColumn: (columnId: string) => void;
  toggleColumnVisibility: (columnId: string) => void;
  showAllColumns: () => void;
  hasHiddenColumns: boolean;
  getVisibleColumnSettings: () => TableColumnOrderSetting[];
};

const TransientColumnVisibilityContext =
  createContext<TransientColumnVisibilityContextValue | null>(null);

export const useTransientColumnVisibility = () =>
  useContext(TransientColumnVisibilityContext);

export const TransientColumnVisibilityProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [allColumns, setAllColumns] = useState<ColumnInfo[]>([]);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(
    new Set(),
  );

  const hideColumn = useCallback((id: string) => {
    setHiddenColumnIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const toggleColumnVisibility = useCallback((id: string) => {
    setHiddenColumnIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const showAllColumns = useCallback(() => setHiddenColumnIds(new Set()), []);

  const getVisibleColumnSettings = useCallback((): TableColumnOrderSetting[] => {
    return allColumns.map(col => ({
      name: col.id,
      enabled: !hiddenColumnIds.has(col.id),
    }));
  }, [allColumns, hiddenColumnIds]);

  const value = useMemo(
    () => ({
      allColumns,
      hiddenColumnIds,
      setAllColumns,
      hideColumn,
      toggleColumnVisibility,
      showAllColumns,
      hasHiddenColumns: hiddenColumnIds.size > 0,
      getVisibleColumnSettings,
    }),
    [
      allColumns,
      hiddenColumnIds,
      hideColumn,
      toggleColumnVisibility,
      showAllColumns,
      getVisibleColumnSettings,
    ],
  );

  return (
    <TransientColumnVisibilityContext.Provider value={value}>
      {children}
    </TransientColumnVisibilityContext.Provider>
  );
};
