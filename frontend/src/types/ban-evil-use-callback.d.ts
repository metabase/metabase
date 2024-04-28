declare namespace React {
  // useCallback parameters are implicitly typed to any.
  // This override has the effect of forcing you to write types any parameters you want to use.
  // See https://github.com/DefinitelyTyped/DefinitelyTyped/issues/52873
  function useCallback<T extends (...args: unknown[]) => unknown>(
    callback: T,
    deps: readonly unknown[],
  ): T;
}
