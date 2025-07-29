import type { FunctionComponent } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { ClientSideOnlyWrapper } from "embedding-sdk/sdk-wrapper/components/private/ClientSideOnlyWrapper/ClientSideOnlyWrapper";
import { ErrorMessage } from "embedding-sdk/sdk-wrapper/components/private/ErrorMessage/ErrorMessage";
import { Loader } from "embedding-sdk/sdk-wrapper/components/private/Loader/Loader";
import { useWaitForSdkBundle } from "embedding-sdk/sdk-wrapper/hooks/private/use-wait-for-sdk-bundle";

type Props<TComponentProps> = {
  getComponent: () => FunctionComponent<TComponentProps> | null | undefined;
  componentProps: TComponentProps | undefined;
};

const ComponentWrapperInner = <TComponentProps,>({
  getComponent,
  componentProps,
}: Props<TComponentProps>) => {
  const { props: metabaseProviderStoreProps } = useMetabaseProviderPropsStore();
  const { isLoading, isError } = useWaitForSdkBundle();

  if (isLoading || !metabaseProviderStoreProps.initialized) {
    return <Loader />;
  }

  if (isError) {
    return <ErrorMessage />;
  }

  const MetabaseProvider = isLoading
    ? null
    : getWindow()?.MetabaseEmbeddingSDK?.MetabaseProvider;
  const Component = getComponent();

  if (!MetabaseProvider || !Component) {
    return null;
  }

  return (
    <MetabaseProvider>
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
        <ComponentWrapperInner
          getComponent={getComponent}
          componentProps={props}
        />
      </ClientSideOnlyWrapper>
    );
  } as ComponentWrapperFunction<TComponentProps>;
};
