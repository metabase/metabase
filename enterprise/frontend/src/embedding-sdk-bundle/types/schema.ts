type ValidateTypeAgainstInferredSchema<TType, TSchemaInferType> =
  Required<TType> extends Required<TSchemaInferType>
    ? TType
    : Required<TSchemaInferType>;

type ValidateInferredSchemaAgainstType<TType, TSchemaInferType> =
  Required<TSchemaInferType> extends Required<TType>
    ? TSchemaInferType
    : Required<TType>;

export type ValidateInferredSchema<
  TType extends ValidateTypeAgainstInferredSchema<_TType, _TSchemaInferType>,
  TSchemaInferType extends ValidateInferredSchemaAgainstType<
    _TType,
    _TSchemaInferType
  >,
  _TType = TType,
  _TSchemaInferType = TSchemaInferType,
> = any;
