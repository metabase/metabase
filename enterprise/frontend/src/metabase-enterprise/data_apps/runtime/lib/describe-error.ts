import { t } from "ttag";

/** The actual error message + stack pulled out of a thrown value. */
export type ErrorDetail = { message: string; stack?: string };

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
    const errorLike =
      typeof value === "object" && value !== null ? value : null;
    const rawMessage =
      errorLike && "message" in errorLike ? errorLike.message : undefined;
    const rawStack =
      errorLike && "stack" in errorLike ? errorLike.stack : undefined;

    const message =
      typeof rawMessage === "string" && rawMessage ? rawMessage : fallback;
    const stack = typeof rawStack === "string" ? rawStack : undefined;

    return { message, stack };
  } catch {
    return { message: fallback };
  }
}
