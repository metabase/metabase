export function maybeCaptureStackTrace(
  error: object | unknown,
  // eslint-disable-next-line @typescript-eslint/ban-types -- Function is what Error.captureStackTrace expects
  constructorOpt: Function | undefined,
) {
  if (error instanceof Error && Error.captureStackTrace) {
    // eslint-disable-next-line no-restricted-syntax -- this is where we wrap it
    Error.captureStackTrace(error, constructorOpt);
  }
}
