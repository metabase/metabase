import { getSdkLoaderCss } from "embedding/sdk-common/lib/get-sdk-loader-css";
import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import type { CommonStylingProps } from "embedding-sdk/types/props";

type SpinnerProps = {
  size?: string;
  color?: string;
};

const SPINNER_CLASS_NAME = "metabase-spinner-loader";

// eslint-disable-next-line no-color-literals
const Spinner = ({ size = "1.5rem", color = "#509EE3" }: SpinnerProps) => {
  return (
    <div>
      <style>
        {getSdkLoaderCss({ className: SPINNER_CLASS_NAME, size, color })}
      </style>

      <span className={SPINNER_CLASS_NAME} />
    </div>
  );
};

export const Loader = ({ className, style }: CommonStylingProps) => {
  const {
    props: { theme, loaderComponent: LoaderComponent },
  } = useMetabaseProviderPropsStore();

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
