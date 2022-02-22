export interface FormField {
  name: string;
  value?: string;
  visited?: boolean;
  active?: boolean;
  error?: string;
  onChange?: (value?: string) => void;
  onFocus?: (value?: string) => void;
  onBlur?: (value?: string) => void;
}

export interface FormValues {
  timezone?: string;
}
