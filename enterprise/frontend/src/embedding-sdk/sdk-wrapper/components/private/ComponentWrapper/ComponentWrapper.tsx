import { type FunctionComponent, useEffect, useRef } from "react";

import { RenderSingleCopy } from "embedding-sdk/sdk-shared/components/RenderSingleCopy/RenderSingleCopy";
import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import { useSdkLoadingState } from "embedding-sdk/sdk-shared/hooks/use-sdk-loading-state";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import {
  SdkLoadingError,
  SdkLoadingState,
} from "embedding-sdk/sdk-shared/types/sdk-loading";
import { ClientSideOnlyWrapper } from "embedding-sdk/sdk-wrapper/components/private/ClientSideOnlyWrapper/ClientSideOnlyWrapper";
import { Error } from "embedding-sdk/sdk-wrapper/components/private/Error/Error";
import { Loader } from "embedding-sdk/sdk-wrapper/components/private/Loader/Loader";
import {
  SDK_LOADING_ERROR_MESSAGE,
  SDK_NOT_LOADED_YET_MESSAGE,
  SDK_NOT_STARTED_LOADING_MESSAGE,
} from "embedding-sdk/sdk-wrapper/config";

type Props<TComponentProps> = {
  getComponent: () => FunctionComponent<TComponentProps> | null | undefined;
  componentProps: TComponentProps | undefined;
};

// When the ComponentWrapper is rendered without being wrapped withing the MetabaseProvider,
// the SDK bundle loading is not triggered.
// We wait for 1 second and if the loading state is still not set or Initial - we set the NotStartedLoading error
const NotStartedLoadingTrigger = () => {
  const timeoutRef = useRef<number>();

  useEffect(function handleSdkBundleNotStartedLoadingState() {
    timeoutRef.current = window.setTimeout(() => {
      const store = ensureMetabaseProviderPropsStore();
      const loadingState = store.getSnapshot().loadingState;

      if (
        loadingState === undefined ||
        loadingState === SdkLoadingState.Initial
      ) {
        store.updateInternalProps({
          loadingError: SdkLoadingError.NotStartedLoading,
        });
      }
    }, 1000);

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
  const { props: metabaseProviderProps } = useMetabaseProviderPropsStore();
  const { isLoading, isError, isNotStartedLoading } = useSdkLoadingState();

  if (isError) {
    return <Error message={SDK_LOADING_ERROR_MESSAGE} />;
  }

  if (isNotStartedLoading) {
    return <Error message={SDK_NOT_STARTED_LOADING_MESSAGE} />;
  }

  if (isLoading || !metabaseProviderProps.loadingState) {
    return <Loader />;
  }

  const MetabaseProvider = isLoading
    ? null
    : getWindow()?.MetabaseEmbeddingSDK?.MetabaseProvider;
  const Component = getComponent();

  if (!MetabaseProvider || !Component || !metabaseProviderProps.reduxStore) {
    return <Error message={SDK_NOT_LOADED_YET_MESSAGE} />;
  }

  return (
    <MetabaseProvider
      {...metabaseProviderProps}
      reduxStore={metabaseProviderProps.reduxStore}
    >
      <Component
        {...(componentProps as JSX.IntrinsicAttributes & TComponentProps)}
      />
    </MetabaseProvider>
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
    return (
      <ClientSideOnlyWrapper ssrFallback={null}>
        <RenderSingleCopy id="component-wrapper">
          <NotStartedLoadingTrigger />
        </RenderSingleCopy>

        <ComponentWrapperInner
          getComponent={getComponent}
          componentProps={props}
        />
      </ClientSideOnlyWrapper>
    );
  } as ComponentWrapperFunction<TComponentProps>;
};
