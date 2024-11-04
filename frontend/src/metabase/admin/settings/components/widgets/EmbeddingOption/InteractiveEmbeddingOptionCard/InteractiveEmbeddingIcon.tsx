import cx from "classnames";

import EmbeddingOptionS from "../EmbeddingOption.module.css";
import type { EmbeddingOptionIconProps } from "../types";

export const InteractiveEmbeddingIcon = ({
  disabled,
}: EmbeddingOptionIconProps) => {
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
      <g clipPath="url(#clip0_1030_4461)">
        <rect
          x="1.25"
          y="1.25"
          width="37.5"
          height="29.5"
          rx="2.75"
          stroke="var(--mb-color-embedding-option-secondary)"
          strokeWidth="2.5"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M18.527 17.473 13 16l5.527-1.473L20 9l1.473 5.527L27 16l-5.527 1.473L20 23l-1.473-5.527ZM29.369 8.631 27 8l2.369-.631L30 5l.631 2.369L33 8l-2.369.631L30 11l-.631-2.369ZM29.974 24.026 28 23.5l1.974-.526L30.5 21l.526 1.974L33 23.5l-1.974.526L30.5 26l-.526-1.974ZM8.974 11.026 7 10.5l1.974-.526L9.5 8l.526 1.974L12 10.5l-1.974.526L9.5 13l-.526-1.974Z"
          fill="var(--mb-color-embedding-option-primary)"
        />
      </g>
      <defs>
        <clipPath id="clip0_1030_4461">
          <path fill="#fff" d="M0 0h40v32H0z" />
        </clipPath>
      </defs>
    </svg>
  );
};
