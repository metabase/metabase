// https://stackoverflow.com/a/73082627/5742640

declare module _ {
  interface UnderscoreStatic {
    compose<Fns extends readonly UnaryFunction[]>(
      ...functions: Composable<Fns>
    ): (arg: ComposeParams<Fns>) => ComposeReturn<Fns>;
  }
}

type UnaryFunction = (arg: any) => any;

type Composable<Fn> = Fn extends readonly [UnaryFunction]
  ? Fn
  : Fn extends readonly [any, ...infer Rest extends readonly UnaryFunction[]]
    ? readonly [(arg: ComposeReturn<Rest>) => any, ...Composable<Rest>]
    : never;

type ComposeReturn<Fns extends readonly UnaryFunction[]> = ReturnType<Fns[0]>;

type ComposeParams<Fns> = Fns extends readonly [
  ...any[],
  infer Last extends UnaryFunction,
]
  ? Parameters<Last>[0]
  : never;
