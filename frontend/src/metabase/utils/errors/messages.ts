export function isResourceNotFoundError(error: any) {
  return error instanceof Object && "status" in error && error.status === 404;
}
