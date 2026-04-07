export const SAVE_DEBOUNCE_MS = 500;
export const MAX_LIMIT_INPUT = 999999999;

/**
 * Sanitizes the input value for a usage limit.
 * Return an integer value or null if the input is empty.
 */
export const sanitizeUsageLimitValue = (inputValue: string) => {
  let sanitizedStrValue = inputValue.trim();

  if (sanitizedStrValue !== "") {
    sanitizedStrValue = Math.min(
      Number(inputValue),
      MAX_LIMIT_INPUT,
    ).toString();
  }

  return sanitizedStrValue ? parseInt(sanitizedStrValue) : null;
};
