// Libraries such as react-datepicker require a process.NODE_ENV define.
export function getDataAppDefine(mode: string): Record<string, string> {
  return {
    "process.env.NODE_ENV": JSON.stringify(
      mode === "production" ? "production" : "development",
    ),
  };
}
