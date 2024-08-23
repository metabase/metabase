export type CoreLoadingProps = {
  error?: any;
  loading?: boolean | boolean[];
};

export type LoadableResult = {
  error?: any;
  isLoading?: boolean;
};

export type CoreLoadingPropsVariant =
  | CoreLoadingProps
  | {
      result?: LoadableResult | LoadableResult[];
    };
