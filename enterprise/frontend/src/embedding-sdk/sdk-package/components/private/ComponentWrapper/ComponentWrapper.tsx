import { type FunctionComponent, useEffect, useId, useRef } from "react";

import { ClientSideOnlyWrapper } from "embedding-sdk/sdk-package/components/private/ClientSideOnlyWrapper/ClientSideOnlyWrapper";
import { Error } from "embedding-sdk/sdk-package/components/private/Error/Error";
import { Loader } from "embedding-sdk/sdk-package/components/private/Loader/Loader";
import {
  SDK_LOADING_ERROR_MESSAGE,
  SDK_NOT_LOADED_YET_MESSAGE,
  SDK_NOT_STARTED_LOADING_MESSAGE,
} from "embedding-sdk/sdk-package/config";
import { EnsureSingleInstance } from "embedding-sdk/sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import { useSdkLoadingState } from "embedding-sdk/sdk-shared/hooks/use-sdk-loading-state";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import {
  SdkLoadingError,
  SdkLoadingState,
} from "embedding-sdk/sdk-shared/types/sdk-loading";

type Props<TComponentProps> = {
  getComponent: () => FunctionComponent<TComponentProps> | null | undefined;
  componentProps: TComponentProps | undefined;
};

const NOT_STARTED_LOADING_WAIT_TIMEOUT = 1000;

// When the ComponentWrapper is rendered without being wrapped withing the MetabaseProvider,
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

  if (isError) {
    return <Error message={SDK_LOADING_ERROR_MESSAGE} />;
  }

  if (isNotStartedLoading) {
    return <Error message={SDK_NOT_STARTED_LOADING_MESSAGE} />;
  }

  if (isLoading || !metabaseProviderInternalProps.loadingState) {
    return <Loader />;
  }

  const ComponentProvider = isLoading
    ? null
    : getWindow()?.MetabaseEmbeddingSDK?.ComponentProvider;
  const Component = getComponent();

  if (
    !ComponentProvider ||
    !Component ||
    !metabaseProviderInternalProps.reduxStore ||
    !metabaseProviderProps
  ) {
    return <Error message={SDK_NOT_LOADED_YET_MESSAGE} />;
  }

  return (
    <ComponentProvider
      {...metabaseProviderProps}
      reduxStore={metabaseProviderInternalProps.reduxStore}
    >
      <Component
        {...(componentProps as JSX.IntrinsicAttributes & TComponentProps)}
      />
    </ComponentProvider>
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
  getComponent: () => FunctionComponent<TComponentProps> | null | undefined,
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
