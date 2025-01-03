import type React from "react";
import { createContext, useContext } from "react";

// Currently, we use this context to know if a component is rendered inside the provider or not.
// This is needed for metabase##50736, to make sure we don't break the host app if for a render the
// sdk components is rendered outside of the sdk provider

const SdkContext = createContext<boolean>(false);

export const SdkContextProvider = ({ children }: React.PropsWithChildren) => {
  return <SdkContext.Provider value={true}>{children}</SdkContext.Provider>;
};

export const useIsInSdkProvider = () => {
  return useContext(SdkContext);
};

export const RenderOnlyInSdkProvider = ({
  children,
}: React.PropsWithChildren) => {
  const isInSdkProvider = useIsInSdkProvider();
  if (!isInSdkProvider) {
    // eslint-disable-next-line no-literal-metabase-strings -- error message
    return "This component requires the MetabaseProvider parent component. Please wrap it within <MetabaseProvider>...</MetabaseProvider> in your component tree.";
  }

  return children;
};

export function renderOnlyInSdkProvider<P extends object>(
  Component: React.ComponentType<P>,
) {
  const WithRenderOnlyInSdkProvider = (props: P) => (
    <RenderOnlyInSdkProvider>
      <Component {...props} />
    </RenderOnlyInSdkProvider>
  );

  WithRenderOnlyInSdkProvider.displayName = `withRenderOnlyInSdkProvider(${
    Component.displayName || Component.name || "Component"
  })`;

  return WithRenderOnlyInSdkProvider;
}
