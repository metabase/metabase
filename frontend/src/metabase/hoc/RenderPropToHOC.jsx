// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function renderPropToHoc(RenderPropComponent) {
  // eslint-disable-next-line react/display-name
  return (ComposedComponent) => (props) => (
    <RenderPropComponent {...props}>
      {(childrenProps) => <ComposedComponent {...props} {...childrenProps} />}
    </RenderPropComponent>
  );
}
