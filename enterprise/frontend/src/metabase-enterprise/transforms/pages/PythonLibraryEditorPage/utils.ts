export function isNotFoundError(error: unknown): boolean {
  return error instanceof Object && "status" in error && error.status === 404;
}
