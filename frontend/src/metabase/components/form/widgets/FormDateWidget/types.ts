export interface FormField {
  name: string;
  value?: string;
  visited?: boolean;
  active?: boolean;
  error?: string;
  onChange: (value?: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}
