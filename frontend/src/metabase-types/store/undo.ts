import type { ReactNode, RefObject } from "react";

import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";
import type { DashCardId, DashboardTabId } from "metabase-types/api";

export interface Undo {
  id: string | number;
  type?: string;
  action?: (() => void) | null;
  message?: ReactNode | ((undo: Undo) => ReactNode);
  timeout?: number;
  initialTimeout?: number;
  actions?: (() => void)[];
  showProgress?: boolean;
  icon?: IconName | null;
  toastColor?: string;
  iconColor?: ColorName;
  actionLabel?: string;
  canDismiss?: boolean;
  startedAt?: number;
  pausedAt?: number | null;
  dismissIconColor?: ColorName;
  extraInfo?: { dashcardIds?: DashCardId[]; tabId?: DashboardTabId } & Record<
    string,
    unknown
  >;
  _domId?: string | number;
  timeoutId: number | null;
  count?: number;
  verb?: string;
  subject?: string;
  extraAction?: {
    label: string;
    action: () => void;
  };
  ref?: RefObject<HTMLDivElement>;
  renderChildren?: (undo: Undo) => ReactNode;
  onDismiss?: (undoId: string | number) => void;
}

export type UndoState = Undo[];
