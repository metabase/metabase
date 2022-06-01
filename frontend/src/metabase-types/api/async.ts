export type AsyncFn = (...args: any[]) => Promise<any>;

export type AsyncReturnType<
  T extends (...args: any) => Promise<any>
> = T extends (...args: any) => Promise<infer R> ? R : any;
