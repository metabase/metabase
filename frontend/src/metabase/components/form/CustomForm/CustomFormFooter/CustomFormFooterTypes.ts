export interface CustomFormFooterProps {
  submitTitle: string;
  cancelTitle?: string;
  fullWidth?: boolean;
  isModal?: boolean;
  footerExtraButtons: React.ReactElement[];
  onCancel?: () => void;
}
