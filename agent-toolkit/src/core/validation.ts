export function validatePositiveInt(
  value: unknown,
  name: string,
): number {
  const num = typeof value === "string" ? parseInt(value, 10) : value;
  if (typeof num !== "number" || !Number.isInteger(num) || num < 1) {
    throw new CliError("invalid_parameter", {
      message: `${name} must be a positive integer, got '${value}'`,
    });
  }
  return num;
}

export function sanitizeString(input: string): string {
  // Reject control characters (ASCII < 0x20) except newlines and tabs in SQL
  const hasControlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(input);
  if (hasControlChars) {
    throw new CliError("invalid_input", {
      message:
        "Input contains control characters. Remove non-printable characters and try again.",
    });
  }
  return input;
}

export function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T {
  if (!allowed.includes(value as T)) {
    throw new CliError("invalid_parameter", {
      message: `Invalid ${name}: '${value}'`,
      hint: `Valid values: ${allowed.join(", ")}`,
    });
  }
  return value as T;
}

export class CliError extends Error {
  code: string;
  hint?: string;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    opts: { message: string; hint?: string; details?: Record<string, unknown> },
  ) {
    super(opts.message);
    this.code = code;
    this.hint = opts.hint;
    this.details = opts.details;
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(this.hint && { hint: this.hint }),
      ...(this.details && { ...this.details }),
    };
  }
}
