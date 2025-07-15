import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import type { CommonStylingProps } from "embedding-sdk/types/props";

type SpinnerProps = {
  size?: string;
  color?: string;
};

// eslint-disable-next-line no-color-literals
const Spinner = ({ size = "1.5rem", color = "#509EE3" }: SpinnerProps) => {
  return (
    <div>
      <style>
        {`
          @keyframes metabase-spinner-loader-animation {
            0% {
              transform: rotate(0deg);
            }

            100% {
              transform: rotate(360deg);
            }
          }

          .metabase-spinner-loader {
            display: inline-block;
            box-sizing: border-box;
            width: ${size};
            height: ${size};
          }

          .metabase-spinner-loader::after {
            content: "";
            display: block;
            box-sizing: border-box;
            width: ${size};
            height: ${size};
            border-radius: 10000px;
            border-width: calc(${size} / 8);
            border-style: solid;
            border-color: ${color} ${color} ${color} transparent;
            animation: metabase-spinner-loader-animation 1.2s linear infinite;
          }
        `}
      </style>

      <span className="metabase-spinner-loader" />
    </div>
  );
};

export const Loader = ({ className, style }: CommonStylingProps) => {
  const { theme, loaderComponent: LoaderComponent } =
    useMetabaseProviderPropsStore();

  return (
    <div
      className={className}
      data-testid="loading-indicator"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        ...style,
      }}
    >
      {LoaderComponent ? (
        <LoaderComponent />
      ) : (
        <Spinner color={theme?.colors?.brand} />
      )}
    </div>
  );
};
