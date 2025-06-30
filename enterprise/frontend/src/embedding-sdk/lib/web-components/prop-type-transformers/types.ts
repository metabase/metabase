export type R2wcDefaultTransformersMap = {
  string: PropTypeTransformer;
  number: PropTypeTransformer;
  boolean: PropTypeTransformer;
  function: PropTypeTransformer;
  json: PropTypeTransformer;
};

export type PropertyPropTypeTransformerMap = {
  property?: never;
};

export type CustomPropTypeTransformersMap = {
  id: PropTypeTransformer;
};

export type PropTypeTransformersMap = R2wcDefaultTransformersMap &
  PropertyPropTypeTransformerMap &
  CustomPropTypeTransformersMap;

export type PropTypeTransformer<TReturnValue = string | number> = (
  value: string,
) => TReturnValue;

export type R2wcPropTypes<TComponentProps> = Record<
  keyof TComponentProps,
  keyof R2wcDefaultTransformersMap
>;

export type PropTypes<TComponentProps> = Record<
  keyof TComponentProps,
  keyof PropTypeTransformersMap
>;
