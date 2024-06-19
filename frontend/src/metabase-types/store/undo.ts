import type { DashCardId, DashboardTabId } from "metabase-types/api";

export interface Undo {
  id: string | number;
  type?: string;
  action?: () => void;
  message?: string;
  timeout?: number;
  actions?: (() => void)[];
  showProgress?: boolean;
  icon?: string | null;
  toastColor?: string;
  actionLabel?: string;
  canDismiss?: boolean;
  startedAt?: number;
  pausedAt?: number;
  dismissIconColor?: string;
  extraInfo?: { dashcardIds?: DashCardId[]; tabId?: DashboardTabId } & Record<
    string,
    unknown
  >;
  _domId?: string | number;
  timeoutId?: number;
  count?: number;
}

// TODO: convert redux/undo and UndoListing.jsx to TS and update type
export type UndoState = Undo[];
