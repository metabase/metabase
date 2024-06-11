// TODO: convert redux/undo and UndoListing.jsx to TS and update type
export type UndoState = {
  id: string | number;
  type?: string;
  action?: () => void;
  actions?: (() => void)[];
  icon?: string;
  toastColor?: string;
  actionLabel?: string;
  canDismiss?: boolean;
  dismissIconColor?: string;
  _domId?: string | number;
}[];
