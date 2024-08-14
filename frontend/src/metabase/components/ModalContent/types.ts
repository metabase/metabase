import type { ReactNode } from "react";

export interface CommonModalProps {
  // takes over the entire screen
  fullPageModal?: boolean;
  // standard modal
  formModal?: boolean;
  centeredTitle?: boolean;

  headerActions?: ReactNode;
  onClose?: () => void;
  onBack?: () => void;
}
