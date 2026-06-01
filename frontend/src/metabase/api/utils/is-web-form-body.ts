/**
 * `FormData` and `URLSearchParams` are the two web-platform body shapes that
 * must be forwarded to the transport as-is: spreading them yields an empty
 * object (neither is enumerable as keys), and the browser needs to set the
 * Content-Type itself (multipart boundary / urlencoded charset).
 */
export const isWebFormBody = (
  value: unknown,
): value is FormData | URLSearchParams =>
  value instanceof FormData || value instanceof URLSearchParams;
