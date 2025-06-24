export interface CommonModalProps {
  // takes over the entire screen
  fullPageModal?: boolean;
  // standard modal
  formModal?: boolean;
  centeredTitle?: boolean;

  headerActions?: React.ReactNode;
  onClose?: () => void;
  onBack?: () => void;
}
