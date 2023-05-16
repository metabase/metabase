export interface FormField {
  name: string;
  value?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
}
