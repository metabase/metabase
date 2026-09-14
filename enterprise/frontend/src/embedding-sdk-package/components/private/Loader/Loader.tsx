// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import { getSdkLoaderCss } from "embedding/sdk-common/lib/get-sdk-loader-css";
import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import { useMetabaseProviderPropsStore } from "embedding-sdk-package/lib/provider-props-store";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

type SpinnerProps = {
  size?: string;
  color?: string;
};

const SPINNER_CLASS_NAME = "metabase-spinner-loader";

// The generated CSS is keyed on the class name, so two spinners of different sizes
// on one page would otherwise overwrite each other's rules.
const getSpinnerClassName = (size: string) =>
  `${SPINNER_CLASS_NAME}-${size.replace(/[^a-z0-9]/gi, "")}`;

// eslint-disable-next-line metabase/no-color-literals
const Spinner = ({ size = "1.5rem", color = "#509EE3" }: SpinnerProps) => {
  const className = getSpinnerClassName(size);

  return (
    <div>
      <style>{getSdkLoaderCss({ className, size, color })}</style>

      <span className={className} />
    </div>
  );
};

export const Loader = ({
  className,
  style,
  theme,
  size,
}: CommonStylingProps & { theme?: MetabaseTheme; size?: string }) => {
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
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {LoaderComponent ? (
        <LoaderComponent />
      ) : (
        <Spinner size={size} color={theme?.colors?.brand} />
      )}
    </div>
  );
};
