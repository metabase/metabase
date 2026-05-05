// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import { getSdkLoaderCss } from "embedding/sdk-common/lib/get-sdk-loader-css";
import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

type SpinnerProps = {
  size?: string;
  color?: string;
};

const SPINNER_CLASS_NAME = "metabase-spinner-loader";

// eslint-disable-next-line metabase/no-color-literals
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

export const Loader = ({
  className,
  style,
  theme,
}: CommonStylingProps & { theme?: MetabaseTheme }) => {
  const {
    state: { props: metabaseProviderProps },
  } = useMetabaseProviderPropsStore();

  const LoaderComponent = metabaseProviderProps?.loaderComponent;

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
