const ExplicitSize = () => (ComposedComponent: any) => {
  const WrappedComponent = (props: any) => (
    <ComposedComponent width={1000} height={1000} {...props} />
  );

  return WrappedComponent;
};

// eslint-disable-next-line import/no-default-export
export default ExplicitSize;
