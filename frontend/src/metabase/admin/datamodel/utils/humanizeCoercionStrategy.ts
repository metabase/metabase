const LEFT_TERM_CONVERSIONS: Record<string, string> = {
  ISO8601: "ISO 8601",
  UNIXSeconds: "UNIX seconds",
  UNIXMilliSeconds: "UNIX milliseconds",
  UNIXMicroSeconds: "UNIX microseconds",
  UNIXNanoSeconds: "UNIX nanoseconds",
  YYYYMMDDHHMMSSString: "YYYYMMDDHHMMSS string",
  YYYYMMDDHHMMSSBytes: "YYYYMMDDHHMMSS bytes",
};

const RIGHT_TERM_CONVERSIONS: Record<string, string> = {
  DateTime: "Datetime",
};

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

  return [treatedLeftTerm, treatedRightTerm].join(" → ");
}

function treatLeftTerm(term: string) {
  return LEFT_TERM_CONVERSIONS[term] || term;
}

function treatRightTerm(term: string) {
  return RIGHT_TERM_CONVERSIONS[term] || term;
}
