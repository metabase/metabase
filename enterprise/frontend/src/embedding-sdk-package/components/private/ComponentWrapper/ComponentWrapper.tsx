import {
  type CSSProperties,
  type ComponentProps,
  type JSX,
  type JSXElementConstructor,
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";

import type { InternalComponent } from "embedding-sdk-bundle/types/sdk-bundle";
import { ClientSideOnlyWrapper } from "embedding-sdk-package/components/private/ClientSideOnlyWrapper/ClientSideOnlyWrapper";
import { Error } from "embedding-sdk-package/components/private/Error/Error";
import { Loader } from "embedding-sdk-package/components/private/Loader/Loader";
import {
  SDK_COMPONENT_MISSING_REQUIRED_PROPERTY_MESSAGE,
  SDK_COMPONENT_NOT_YET_AVAILABLE_MESSAGE,
  SDK_COMPONENT_UNRECOGNIZED_PROPERTY_MESSAGE,
  SDK_LOADING_ERROR_MESSAGE,
  SDK_NOT_LOADED_YET_MESSAGE,
  SDK_NOT_STARTED_LOADING_MESSAGE,
} from "embedding-sdk-package/constants/error-messages";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { useSdkLoadingState } from "embedding-sdk-shared/hooks/use-sdk-loading-state";
import { applyThemePreset } from "embedding-sdk-shared/lib/apply-theme-preset";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import {
  SdkLoadingError,
  SdkLoadingState,
} from "embedding-sdk-shared/types/sdk-loading";
import type { FunctionParametersSchemaValidationErrorMetadata } from "embedding-sdk-shared/types/validation";

type Props<TComponentProps> = {
  getComponent: () =>
    | InternalComponent<JSXElementConstructor<TComponentProps>>
    | null
    | undefined;
  componentProps: TComponentProps | undefined;
};

const NOT_STARTED_LOADING_WAIT_TIMEOUT = 1000;

// EMB-875: defaults match FlexibleSizeComponent on the bundle side, so the
// package-side loader/error box matches the post-init box and prevents a
// position shift when the SDK bundle finishes loading.
const DEFAULT_BOUNDED_HEIGHT = "600px";
const DEFAULT_BOUNDED_WIDTH = "100%";

const Box = ({
  height,
  width,
  children,
}: {
  height?: CSSProperties["height"];
  width?: CSSProperties["width"];
  children: ReactNode;
}) => (
  <div
    style={{
      height: height ?? DEFAULT_BOUNDED_HEIGHT,
      width: width ?? DEFAULT_BOUNDED_WIDTH,
    }}
  >
    {children}
  </div>
);

// When the ComponentWrapper is rendered without being wrapped within the MetabaseProvider,
// the SDK bundle loading is not triggered.
// We wait for 1 second and if the loading state is still not set or Initial - we set the NotStartedLoading error
const NotStartedLoadingTrigger = () => {
  const timeoutRef = useRef<number>();

  useEffect(function handleSdkBundleNotStartedLoadingState() {
    timeoutRef.current = window.setTimeout(() => {
      const store = ensureMetabaseProviderPropsStore();
      const loadingState = store.getState().internalProps.loadingState;

      if (
        loadingState === undefined ||
        loadingState === SdkLoadingState.Initial
      ) {
        store.updateInternalProps({
          loadingError: SdkLoadingError.NotStartedLoading,
        });
      }
    }, NOT_STARTED_LOADING_WAIT_TIMEOUT);

    return () => {
      window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return null;
};

const getValidationErrorMessage = (
  errorMetadata: FunctionParametersSchemaValidationErrorMetadata | undefined,
) => {
  if (!errorMetadata) {
    return null;
  }

  const { errorCode, data } = errorMetadata;

  switch (errorCode) {
    case "missing_required_property":
      return `"${data}": ${SDK_COMPONENT_MISSING_REQUIRED_PROPERTY_MESSAGE}`;
    case "unrecognized_keys":
      return `"${data}": ${SDK_COMPONENT_UNRECOGNIZED_PROPERTY_MESSAGE}`;
  }

  return null;
};

const RenderComponentWithValidation = <
  TComponent extends InternalComponent<JSXElementConstructor<any>>,
>({
  $component: Component,
  ...props
}: PropsWithChildren<
  {
    $component: TComponent;
  } & ComponentProps<TComponent>
>) => {
  const validateFunctionSchema =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.validateFunctionSchema;
  const schema = Component.schema;

  // We validate only initial props currently
  const propsToValidateRef = useRef(props);

  useEffect(() => {
    if (!validateFunctionSchema || !schema) {
      return;
    }

    const validateAsync = async () => {
      try {
        const { validateParameters } = validateFunctionSchema(schema);
        const validationResult = validateParameters([
          propsToValidateRef.current,
        ]);

        if (!validationResult.success) {
          const error = getValidationErrorMessage(
            validationResult.errorMetadata,
          );

          if (error) {
            console.error(error);
          }
        }
      } catch (error) {
        console.warn(`Error during component schema validation: ${error}`);
      }
    };

    validateAsync();
  }, [schema, validateFunctionSchema]);

  return <Component {...props}>{props.children}</Component>;
};

const ComponentWrapperInner = <TComponentProps,>({
  getComponent,
  componentProps,
}: Props<TComponentProps>) => {
  const {
    state: {
      internalProps: metabaseProviderInternalProps,
      props: metabaseProviderProps,
    },
  } = useMetabaseProviderPropsStore();
  const { isLoading, isError, isNotStartedLoading } = useSdkLoadingState();

  const { theme } = metabaseProviderProps ?? {};
  const adjustedTheme = useMemo(() => applyThemePreset(theme), [theme]);

  const { height, width } =
    (componentProps as {
      height?: CSSProperties["height"];
      width?: CSSProperties["width"];
    }) ?? {};

  if (isError) {
    return (
      <Box height={height} width={width}>
        <Error theme={adjustedTheme} message={SDK_LOADING_ERROR_MESSAGE} />
      </Box>
    );
  }

  if (isNotStartedLoading) {
    return (
      <Box height={height} width={width}>
        <Error
          theme={adjustedTheme}
          message={SDK_NOT_STARTED_LOADING_MESSAGE}
        />
      </Box>
    );
  }

  if (isLoading || !metabaseProviderInternalProps.loadingState) {
    return (
      <Box height={height} width={width}>
        <Loader theme={adjustedTheme} />
      </Box>
    );
  }

  const ComponentProvider = isLoading
    ? null
    : getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.ComponentProvider;

  if (
    !ComponentProvider ||
    !metabaseProviderInternalProps.reduxStore ||
    !metabaseProviderProps
  ) {
    return <Error theme={adjustedTheme} message={SDK_NOT_LOADED_YET_MESSAGE} />;
  }

  const Component = getComponent();

  if (!Component) {
    return (
      <Error
        theme={adjustedTheme}
        message={SDK_COMPONENT_NOT_YET_AVAILABLE_MESSAGE}
      />
    );
  }

  return (
    <RenderComponentWithValidation
      $component={ComponentProvider}
      {...metabaseProviderProps}
      reduxStore={metabaseProviderInternalProps.reduxStore}
    >
      <RenderComponentWithValidation
        $component={Component as InternalComponent<JSXElementConstructor<any>>}
        {...componentProps}
      />
    </RenderComponentWithValidation>
  );
};

type ComponentWrapperFunction<P> = [P] extends [never]
  ? () => JSX.Element
  : [P] extends [undefined]
    ? (props?: P) => JSX.Element
    : (props: P) => JSX.Element;

export const createComponent = <
  TComponentProps extends Record<any, any> | undefined | never = never,
>(
  getComponent: () =>
    | InternalComponent<JSXElementConstructor<TComponentProps>>
    | null
    | undefined,
): ComponentWrapperFunction<TComponentProps> => {
  return function ComponentWrapper(props: TComponentProps) {
    const ensureSingleInstanceId = useId();

    return (
      <ClientSideOnlyWrapper ssrFallback={null}>
        <EnsureSingleInstance
          groupId="component-wrapper"
          instanceId={ensureSingleInstanceId}
        >
          <NotStartedLoadingTrigger />
        </EnsureSingleInstance>

        <ComponentWrapperInner
          getComponent={getComponent}
          componentProps={props}
        />
      </ClientSideOnlyWrapper>
    );
  } as ComponentWrapperFunction<TComponentProps>;
};
