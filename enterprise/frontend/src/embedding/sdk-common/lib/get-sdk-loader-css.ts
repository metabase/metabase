export type SdkLoaderData = {
  className: string;
  size?: string;
  color?: string;
};

export const getSdkLoaderCss = ({
  className,
  size = "1.5rem",
  // eslint-disable-next-line metabase/no-color-literals
  color = "#509EE3",
}: SdkLoaderData) => `
  @keyframes ${className}-animation {
    0% {
      transform: rotate(0deg);
    }

    100% {
      transform: rotate(360deg);
    }
  }

  .${className} {
    display: inline-block;
    box-sizing: border-box;
    width: ${size};
    height: ${size};
  }

  .${className}::after {
    content: "";
    display: block;
    box-sizing: border-box;
    width: ${size};
    height: ${size};
    border-radius: 10000px;
    border-width: calc(${size} / 8);
    border-style: solid;
    border-color: ${color} ${color} ${color} transparent;
    animation: ${className}-animation 1.2s linear infinite;
  }
`;
