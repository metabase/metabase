import { useRef } from "react";
import type { SharingPaneIconProps } from "metabase/public/components/widgets/SharingPane/icons/types";
import { useMantineTheme } from "metabase/ui";

export const StaticEmbedIcon = ({
  disabled,
  hovered,
}: SharingPaneIconProps) => {
  const theme = useMantineTheme();
  const ref = useRef(null);

  let outerFillColor, innerFillColor;

  if (!disabled && hovered) {
    outerFillColor = theme.colors.brand[0];
    innerFillColor = theme.colors.brand[1];
  } else {
    outerFillColor = theme.colors.bg[1];
    innerFillColor = theme.colors.text[2];
  }

  return (
    <svg
      ref={ref}
      width="40"
      height="32"
      viewBox="0 0 40 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="1.25"
        y="1.25"
        width="37.5"
        height="29.5"
        rx="2.75"
        stroke={outerFillColor}
        strokeWidth="2.5"
      />
      <path
        d="M14 12C14 10.8954 14.8954 10 16 10H33C34.1046 10 35 10.8954 35 12V17H14V12Z"
        fill={innerFillColor}
        fillOpacity="0.5"
      />
      <path
        d="M14 19H23V28H16C14.8954 28 14 27.1046 14 26V19Z"
        fill={innerFillColor}
        fillOpacity="0.5"
      />
      <path
        d="M25 19H35V26C35 27.1046 34.1046 28 33 28H25V19Z"
        fill={innerFillColor}
        fillOpacity="0.5"
      />
      <path
        d="M5 10H11V28H7C5.89543 28 5 27.1046 5 26V10Z"
        fill={outerFillColor}
      />
      <path
        d="M5 6C5 4.89543 5.89543 4 7 4H33C34.1046 4 35 4.89543 35 6V8H5V6Z"
        fill={outerFillColor}
      />
    </svg>
  );
};
