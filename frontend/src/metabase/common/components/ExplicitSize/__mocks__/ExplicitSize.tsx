export const ExplicitSize = () => (ComposedComponent: any) => {
  const WrappedComponent = (props: any) => (
    <ComposedComponent width={1000} height={1000} {...props} />
  );

  return WrappedComponent;
};
