export type R2wcDefaultTransformersMap = {
  string: PropTypeTransformer;
  number: PropTypeTransformer;
  boolean: PropTypeTransformer;
  function: PropTypeTransformer;
  json: PropTypeTransformer;
};

export type CustomPropTypeTransformersMap = {
  id: PropTypeTransformer;
};

export type PropTypeTransformersMap = R2wcDefaultTransformersMap &
  CustomPropTypeTransformersMap;

export type PropTypeTransformer<TReturnValue = string | number> = (
  value: string,
) => TReturnValue;

export type PropTypes<TComponentProps> = Partial<
  Record<keyof TComponentProps, keyof PropTypeTransformersMap>
>;
