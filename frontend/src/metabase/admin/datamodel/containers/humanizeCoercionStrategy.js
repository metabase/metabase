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
  const conversions = {
    ISO8601: "ISO 8601",
    UNIXSeconds: "UNIX seconds",
    UNIXMilliSeconds: "UNIX milliseconds",
    UNIXMicroSeconds: "UNIX microseconds",
    YYYYMMDDHHMMSSString: "YYYYMMDDHHMMSS",
  };

  return conversions[term] || term;
}

function treatRightTerm(term) {
  const conversions = {
    DateTime: "Datetime",
  };

  return conversions[term] || term;
}
