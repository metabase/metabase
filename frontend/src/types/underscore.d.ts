// https://github.com/ramda/types/blob/develop/types/compose.d.ts

declare module _ {
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
    // fallback overload if number of composed functions greater than 7
    compose<TArgs extends any[], R1, R2, R3, R4, R5, R6, R7, TResult>(
      ...func: [
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
  }
}
