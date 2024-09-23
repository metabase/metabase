import {
  type UseEmbeddingSettingsIconColorsProps,
  useEmbeddingSettingsIconColors,
} from "../use-embedding-settings-icon-colors";

export const StaticEmbeddingIcon = ({
  disabled,
}: UseEmbeddingSettingsIconColorsProps) => {
  const { primary, secondary } = useEmbeddingSettingsIconColors({ disabled });

  return (
    <svg width="42" height="34" fill="white" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="1.25"
        y="1.25"
        width="37.5"
        height="29.5"
        rx="2.75"
        stroke={secondary}
        strokeWidth="2.5"
      />
      <path
        d="M14 12a2 2 0 0 1 2-2h17a2 2 0 0 1 2 2v5H14v-5ZM14 19h9v9h-7a2 2 0 0 1-2-2v-7ZM25 19h10v7a2 2 0 0 1-2 2h-8v-9Z"
        fill={primary}
      />
      <path
        d="M5 10h6v18H7a2 2 0 0 1-2-2V10ZM5 6a2 2 0 0 1 2-2h26a2 2 0 0 1 2 2v2H5V6Z"
        fill={secondary}
      />
    </svg>
  );
};
