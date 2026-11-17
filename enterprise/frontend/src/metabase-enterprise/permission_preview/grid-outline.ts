import { useSyncExternalStore } from "react";

import type { OutlinedGridCell } from "metabase/plugins";
import { useLocation } from "metabase/router";

type StoredCell = OutlinedGridCell & { pathname: string };

let storedCell: StoredCell | null = null;
const listeners = new Set<() => void>();

/** "Show in grid": outlines one cell of the grid at `pathname`, until "Show in grid" picks another. */
export function outlineGridCell(pathname: string, cell: OutlinedGridCell) {
  storedCell = { ...cell, pathname };
  listeners.forEach((listener) => listener());
}

/** The cell "Show in grid" asked for, while the grid it opened is on screen. */
export function useOutlinedGridCell(): OutlinedGridCell | null {
  const cell = useSyncExternalStore(subscribe, () => storedCell);
  const { pathname } = useLocation();
  return cell != null && cell.pathname === pathname ? cell : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
