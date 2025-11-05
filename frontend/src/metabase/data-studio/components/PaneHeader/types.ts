export type PaneHeaderTab = {
  label: string;
  to: string;
  isSelected: boolean;
};

export type PaneHeaderValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};
