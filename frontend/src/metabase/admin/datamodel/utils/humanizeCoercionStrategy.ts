import { t, c } from "ttag";

const GET_LEFT_TERM_CONVERSIONS = (): Record<string, string> => ({
  ISO8601: t`ISO 8601`,
  UNIXSeconds: t`UNIX seconds`,
  UNIXMilliSeconds: t`UNIX milliseconds`,
  UNIXMicroSeconds: t`UNIX microseconds`,
  UNIXNanoSeconds: t`UNIX nanoseconds`,
  YYYYMMDDHHMMSSString: t`YYYYMMDDHHMMSS string`,
  YYYYMMDDHHMMSSBytes: t`YYYYMMDDHHMMSS bytes`,
});

const GET_RIGHT_TERM_CONVERSIONS = (): Record<string, string> => ({
  DateTime: t`Datetime`,
});

/**
 * Converts -> to → and humanizes strings
 * @param {string} fullString - The coercion strategy as it comes from the back-end
 * @returns {string}
 */
export function humanizeCoercionStrategy(fullString: string) {
  const shortString = fullString.replace("Coercion/", "");

  const [leftTerm, rightTerm] = shortString.split("->");

  return rightTerm === undefined
    ? shortString
    : treatTermsAndJoin(leftTerm, rightTerm);
}

function treatTermsAndJoin(left: string, right: string) {
  const treatedLeftTerm = treatLeftTerm(left);
  const treatedRightTerm = treatRightTerm(right);

  return [treatedLeftTerm, treatedRightTerm].join(
    c("arrow denoting a conversion. eg: string → date").t` → `,
  );
}

function treatLeftTerm(term: string) {
  return GET_LEFT_TERM_CONVERSIONS()[term] || term;
}

function treatRightTerm(term: string) {
  return GET_RIGHT_TERM_CONVERSIONS()[term] || term;
}
