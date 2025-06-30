import type { FunctionComponent } from "react";

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
  const { isLoading, isError } = useWaitForSdkBundle();

  if (isLoading) {
    return <Loader />;
  }

  if (isError) {
    return <ErrorMessage />;
  }

  const Component = getComponent();

  if (!Component) {
    return null;
  }

  return (
    <Component
      {...(componentProps as JSX.IntrinsicAttributes & TComponentProps)}
    />
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
      <ComponentWrapperInner
        getComponent={getComponent}
        componentProps={props}
      />
    );
  } as ComponentWrapperFunction<TComponentProps>;
};
