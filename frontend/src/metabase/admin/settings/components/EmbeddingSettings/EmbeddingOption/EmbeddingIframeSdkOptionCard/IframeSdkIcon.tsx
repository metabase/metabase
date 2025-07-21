import cx from "classnames";

import EmbeddingOptionS from "../EmbeddingOption.module.css";
import type { EmbeddingOptionIconProps } from "../types";

export const IframeSdkIcon = ({ disabled }: EmbeddingOptionIconProps) => {
  return (
    <svg
      width="40"
      height="32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cx(EmbeddingOptionS.EmbeddingOptionIcon, {
        [EmbeddingOptionS.Disabled]: disabled,
      })}
    >
      <g clipPath="url(#iframe-sdk-clip)">
        <rect
          x="1.25"
          y="1.25"
          width="37.5"
          height="29.5"
          rx="2.75"
          stroke="var(--mb-color-embedding-option-secondary)"
          strokeWidth="2.5"
        />
        {/* Main iframe container */}
        <rect
          x="4"
          y="6"
          width="32"
          height="20"
          rx="1"
          stroke="var(--mb-color-embedding-option-primary)"
          strokeWidth="1.5"
          fill="none"
        />
        {/* Embedded content representation */}
        <rect
          x="6"
          y="8"
          width="28"
          height="2"
          rx="1"
          fill="var(--mb-color-embedding-option-primary)"
        />
        <rect
          x="6"
          y="12"
          width="20"
          height="1.5"
          rx="0.75"
          fill="var(--mb-color-embedding-option-secondary)"
        />
        <rect
          x="6"
          y="15"
          width="24"
          height="1.5"
          rx="0.75"
          fill="var(--mb-color-embedding-option-secondary)"
        />
        <rect
          x="6"
          y="18"
          width="16"
          height="1.5"
          rx="0.75"
          fill="var(--mb-color-embedding-option-secondary)"
        />
        {/* Small chart representation in top right */}
        <circle
          cx="30"
          cy="13"
          r="2"
          fill="var(--mb-color-embedding-option-primary)"
          opacity="0.7"
        />
        <path
          d="M28 15.5 L30 13.5 L32 15.5"
          stroke="var(--mb-color-embedding-option-primary)"
          strokeWidth="1"
          fill="none"
        />
      </g>
      <defs>
        <clipPath id="iframe-sdk-clip">
          <rect width="40" height="32" rx="4" />
        </clipPath>
      </defs>
    </svg>
  );
};
