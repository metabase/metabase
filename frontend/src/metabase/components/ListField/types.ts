export type Option = any[];

export interface ListFieldProps {
  onChange: (value: string[]) => void;
  value: string[];
  options: Option;
  multi: boolean;
  optionRenderer: (option: any) => JSX.Element;
  placeholder: string;
  isDashboardFilter?: boolean;
  checkedColor?: string;
}
