export type UseEmbeddingSettingsIconColorsProps = {
  disabled: boolean;
};

export const useEmbeddingSettingsIconColors = ({
  disabled,
}: UseEmbeddingSettingsIconColorsProps) => {
  if (disabled) {
    return {
      primary: "var(--mb-base-color-gray-30)",
      secondary: "var(--mb-base-color-gray-10)",
    };
  }

  return {
    primary: "var(--mb-base-color-brand-40)",
    secondary: "var(--mb-base-color-brand-20)",
  };
};
