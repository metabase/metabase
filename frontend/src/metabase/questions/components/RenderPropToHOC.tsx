import type { ComponentType, ReactNode } from "react";

type RenderPropComponentType<TChildrenProps> = ComponentType<{
  children: (childrenProps: TChildrenProps) => ReactNode;
}>;

/**
 * @deprecated HOCs are deprecated
 */
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function renderPropToHoc<TChildrenProps>(
  RenderPropComponent: RenderPropComponentType<TChildrenProps>,
) {
  return <TProps extends object>(
    ComposedComponent: ComponentType<TProps & TChildrenProps>,
  ) => {
    function RenderPropHoc(props: TProps) {
      return (
        <RenderPropComponent {...props}>
          {(childrenProps: TChildrenProps) => (
            <ComposedComponent {...props} {...childrenProps} />
          )}
        </RenderPropComponent>
      );
    }

    return RenderPropHoc;
  };
}
