import type { DateRangePickerProps } from "embedding-sdk-bundle/components/public/DateRangePicker/DateRangePicker";
import { Loader } from "embedding-sdk-package/components/private/Loader/Loader";
import { useMetabaseProviderPropsStore } from "embedding-sdk-package/lib/provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

const LOADER_HEIGHT = "2.625rem";
const LOADER_SIZE = "1rem";

export const DateRangePicker = (props: DateRangePickerProps) => {
  const {
    state: {
      props: providerProps,
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const bundle = getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE;
  const ComponentProvider = bundle?.ComponentProvider;
  const BundleDateRangePicker = bundle?.DateRangePicker;

  if (
    !ComponentProvider ||
    !BundleDateRangePicker ||
    !reduxStore ||
    !providerProps
  ) {
    return (
      <Loader
        className={props.className}
        size={LOADER_SIZE}
        style={{
          display: "inline-flex",
          width: "fit-content",
          height: LOADER_HEIGHT,
          ...props.style,
        }}
        theme={providerProps?.theme}
      />
    );
  }

  return (
    <ComponentProvider {...providerProps} reduxStore={reduxStore}>
      <BundleDateRangePicker {...props} />
    </ComponentProvider>
  );
};
