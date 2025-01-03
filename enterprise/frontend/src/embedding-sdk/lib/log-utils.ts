// Note: this functions need to return an array of two elements, when styling
// console.logs, the style needs to passed as second argument
// To use them, do `console.log(...bigWarningHeader("message"), "rest of the message")`

// Note 2: why do we even need those? Because at the moment the SDK may log a
// lot of exceptions, we need to make actionable messages stand out

export const bigWarningHeader = (message: string) => {
  return [
    `%c${message}\n`,
    "color: #FCF0A6; font-size: 16px; font-weight: bold;",
  ];
};

export const bigErrorHeader = (message: string) => {
  return [
    `%c${message}\n`,
    "color: #FF2222; font-size: 16px; font-weight: bold;",
  ];
};
