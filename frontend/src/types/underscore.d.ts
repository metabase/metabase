/**
 * The original types could be found at https://github.com/ramda/types/blob/13d36d597c51793627a7b0dc0d83c62f1236029b/types/compose.d.ts
 * This version rearranges and the type in a logical way and adds an extra overrides to handle a case where we pass `any` type to `_.compose`.
 */

declare namespace _ {
  interface UnderscoreStatic {
    compose<TArgs extends any[], R1>(
      f1: (...args: TArgs) => R1,
    ): (...args: TArgs) => R1;
    compose<TArgs extends any[], R1, R2>(
      f2: (a: R1) => R2,
      f1: (...args: TArgs) => R1,
    ): (...args: TArgs) => R2;
    compose<TArgs extends any[], R1, R2, R3>(
      f3: (a: R2) => R3,
      f2: (a: R1) => R2,
      f1: (...args: TArgs) => R1,
    ): (...args: TArgs) => R3;
    compose<TArgs extends any[], R1, R2, R3, R4>(
      f4: (a: R3) => R4,
      f3: (a: R2) => R3,
      f2: (a: R1) => R2,
      f1: (...args: TArgs) => R1,
    ): (...args: TArgs) => R4;
    compose<TArgs extends any[], R1, R2, R3, R4, R5>(
      f5: (a: R4) => R5,
      f4: (a: R3) => R4,
      f3: (a: R2) => R3,
      f2: (a: R1) => R2,
      f1: (...args: TArgs) => R1,
    ): (...args: TArgs) => R5;
    compose<TArgs extends any[], R1, R2, R3, R4, R5, R6>(
      f6: (a: R5) => R6,
      f5: (a: R4) => R5,
      f4: (a: R3) => R4,
      f3: (a: R2) => R3,
      f2: (a: R1) => R2,
      f1: (...args: TArgs) => R1,
    ): (...args: TArgs) => R6;
    compose<TArgs extends any[], R1, R2, R3, R4, R5, R6, R7>(
      f7: (a: R6) => R7,
      f6: (a: R5) => R6,
      f5: (a: R4) => R5,
      f4: (a: R3) => R4,
      f3: (a: R2) => R3,
      f2: (a: R1) => R2,
      f1: (...args: TArgs) => R1,
    ): (...args: TArgs) => R7;
    compose<TArgs extends any[], R1, R2, R3, R4, R5, R6, R7>(
      f7: (a: R6) => R7,
      f6: (a: R5) => R6,
      f5: (a: R4) => R5,
      f4: (a: R3) => R4,
      f3: (a: R2) => R3,
      f2: (a: R1) => R2,
      f1: (...args: TArgs) => R1,
    ): (...args: TArgs) => R7;
    // fallback overload if the number of composed functions is greater than 7
    compose<TArgs extends any[], R1, R2, R3, R4, R5, R6, R7, TResult>(
      ...funcs: [
        fnLast: (a: any) => TResult,
        ...func: Array<(a: any) => any>,
        f7: (a: R6) => R7,
        f6: (a: R5) => R6,
        f5: (a: R4) => R5,
        f4: (a: R3) => R4,
        f3: (a: R2) => R3,
        f2: (a: R1) => R2,
        f1: (...args: TArgs) => R1,
      ]
    ): (...args: TArgs) => TResult;
    /**
     * This last overload is added to handle the case where passing a function with `any` type to `_.compose`,
     * without this overload, the returned composed function type would be `unknown` rather than `any` which is
     * expected.
     */
    compose<T>(...funcs: T[]): any;
  }
}
