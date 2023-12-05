export interface OperatorOption<Operator> {
  operator: Operator;

  // An operator's longDisplayName is going to be used by default,
  // but widgets can overwrite it with a custom name.
  name?: string;
}
