export function getModerationStatusIcon(status) {
  return {
    verification: "verified",
    flag: "warning_colorized",
    question: "clarification",
  }[status];
}
