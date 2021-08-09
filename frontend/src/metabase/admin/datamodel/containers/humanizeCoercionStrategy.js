const LEFT_TERM_CONVERSIONS = {
  ISO8601: "ISO 8601",
  UNIXSeconds: "UNIX seconds",
  UNIXMilliSeconds: "UNIX milliseconds",
  UNIXMicroSeconds: "UNIX microseconds",
  YYYYMMDDHHMMSSString: "YYYYMMDDHHMMSS string",
  YYYYMMDDHHMMSSBytes: "YYYYMMDDHHMMSS bytes",
};

const RIGHT_TERM_CONVERSIONS = {
  DateTime: "Datetime",
};

/**
 * Converts -> to → and humanizes strings
 * @param {string} fullString - The coercion strategy as it comes from the back-end
 * @returns {string}
 */
export function humanizeCoercionStrategy(fullString) {
  const shortString = fullString.replace("Coercion/", "");

  const [leftTerm, rightTerm] = shortString.split("->");

  return rightTerm === undefined
    ? shortString
    : treatTermsAndJoin(leftTerm, rightTerm);
}

function treatTermsAndJoin(left, right) {
  const treatedLeftTerm = treatLeftTerm(left);
  const treatedRightTerm = treatRightTerm(right);

  return [treatedLeftTerm, treatedRightTerm].join(" → ");
}

function treatLeftTerm(term) {
  return LEFT_TERM_CONVERSIONS[term] || term;
}

function treatRightTerm(term) {
  return RIGHT_TERM_CONVERSIONS[term] || term;
}
