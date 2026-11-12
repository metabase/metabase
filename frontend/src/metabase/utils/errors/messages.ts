/* eslint-disable @typescript-eslint/no-unsafe-member-access -- FIXME: any-typed values */
export function isResourceNotFoundError(error: any) {
  return error instanceof Object && "status" in error && error.status === 404;
}
