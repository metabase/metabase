import type { IconName } from "metabase/ui";
import type { DashCardId, DashboardTabId } from "metabase-types/api";

export interface Undo {
  id: string | number;
  type?: string;
  action?: (() => void) | null;
  message?: string | ((undo: Undo) => string);
  timeout?: number;
  initialTimeout?: number;
  actions?: (() => void)[];
  showProgress?: boolean;
  icon?: IconName | null;
  toastColor?: string;
  actionLabel?: string;
  canDismiss?: boolean;
  startedAt?: number;
  pausedAt?: number | null;
  dismissIconColor?: string;
  extraInfo?: { dashcardIds?: DashCardId[]; tabId?: DashboardTabId } & Record<
    string,
    unknown
  >;
  _domId?: string | number;
  timeoutId: number | null;
  count?: number;
  verb?: string;
  subject?: string;
}

export type UndoState = Undo[];
