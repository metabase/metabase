import { t } from "ttag";

/** The actual error message + stack pulled out of a thrown value. */
export type ErrorDetail = { message: string; stack?: string };

/** Loose shape we defensively read off a thrown value (or membrane proxy). */
type MaybeError = { message?: unknown; stack?: unknown };

/**
 * Pull a human-readable message + stack out of a thrown value.
 *
 * Errors thrown *inside* the bundle come from the Near-Membrane sandbox's guest
 * realm, so they arrive as opaque proxies: they log as `#<Object>` and fail
 * `instanceof Error` against the host realm. Reading their *string* properties
 * across the membrane still returns real primitives, so we read `message` /
 * `stack` defensively (the membrane could also throw, hence the try/catch).
 */
export function describeError(
  value: unknown,
  fallbackMessage?: string,
): ErrorDetail {
  const fallback = fallbackMessage || t`An unexpected error occurred.`;

  try {
    const normalizedValue = value as MaybeError | null;
    const message =
      normalizedValue &&
      typeof normalizedValue.message === "string" &&
      normalizedValue.message
        ? normalizedValue.message
        : fallback;
    const stack =
      normalizedValue && typeof normalizedValue.stack === "string"
        ? normalizedValue.stack
        : undefined;

    return { message, stack };
  } catch {
    return { message: fallback };
  }
}
