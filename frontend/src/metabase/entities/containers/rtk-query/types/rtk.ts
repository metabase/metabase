import type {
  QueryActionCreatorResult,
  QueryArgFrom,
  QueryDefinition,
  QueryStatus,
  QuerySubState,
  ResultTypeFrom,
  SkipToken,
  SubscriptionOptions,
  TSHelpersId,
  TSHelpersNoInfer,
  TSHelpersOverride,
} from "@reduxjs/toolkit/query";

/**
 * UseQuery is not exported from @reduxjs/toolkit
 * These types are copied from @reduxjs/toolkit/dist/query/react
 */
export type UseQuery<D extends QueryDefinition<any, any, any, any>> = <
  R extends Record<string, any> = UseQueryStateDefaultResult<D>,
>(
  arg: QueryArgFrom<D> | SkipToken,
  options?: UseQuerySubscriptionOptions & UseQueryStateOptions<D, R>,
) => UseQueryHookResult<D, R>;

type UseQueryHookResult<
  D extends QueryDefinition<any, any, any, any>,
  R = UseQueryStateDefaultResult<D>,
> = UseQueryStateResult<D, R> & UseQuerySubscriptionResult<D>;

type UseQuerySubscriptionResult<D extends QueryDefinition<any, any, any, any>> =
  Pick<QueryActionCreatorResult<D>, "refetch">;

type UseQueryStateResult<
  _ extends QueryDefinition<any, any, any, any>,
  R,
> = TSHelpersNoInfer<R>;

type UseQueryStateOptions<
  D extends QueryDefinition<any, any, any, any>,
  R extends Record<string, any>,
> = {
  skip?: boolean;
  selectFromResult?: QueryStateSelector<R, D>;
};

type QueryStateSelector<
  R extends Record<string, any>,
  D extends QueryDefinition<any, any, any, any>,
> = (state: UseQueryStateDefaultResult<D>) => R;

type UseQuerySubscriptionOptions = SubscriptionOptions & {
  skip?: boolean;
  refetchOnMountOrArgChange?: boolean | number;
};

type UseQueryStateBaseResult<D extends QueryDefinition<any, any, any, any>> =
  QuerySubState<D> & {
    currentData?: ResultTypeFrom<D>;
    isUninitialized: false;
    isLoading: false;
    isFetching: false;
    isSuccess: false;
    isError: false;
  };

type UseQueryStateDefaultResult<D extends QueryDefinition<any, any, any, any>> =
  TSHelpersId<
    | TSHelpersOverride<
        Extract<
          UseQueryStateBaseResult<D>,
          { status: QueryStatus.uninitialized }
        >,
        { isUninitialized: true }
      >
    | TSHelpersOverride<
        UseQueryStateBaseResult<D>,
        | { isLoading: true; isFetching: boolean; data: undefined }
        | ({
            isSuccess: true;
            isFetching: true;
            error: undefined;
          } & Required<
            Pick<UseQueryStateBaseResult<D>, "data" | "fulfilledTimeStamp">
          >)
        | ({
            isSuccess: true;
            isFetching: false;
            error: undefined;
          } & Required<
            Pick<
              UseQueryStateBaseResult<D>,
              "data" | "fulfilledTimeStamp" | "currentData"
            >
          >)
        | ({ isError: true } & Required<
            Pick<UseQueryStateBaseResult<D>, "error">
          >)
      >
  > & {
    status: QueryStatus;
  };
