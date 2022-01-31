export interface FormField {
  name: string;
  value?: string;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
}

export type TreatBeforePosting = "base64";
