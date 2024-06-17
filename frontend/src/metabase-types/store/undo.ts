// TODO: convert redux/undo and UndoListing.jsx to TS and update type
export type UndoState = {
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
  _domId?: string | number;
}[];
