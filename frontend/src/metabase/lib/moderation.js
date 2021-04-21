export function getModerationStatusIcon(status) {
  switch (status) {
    case "verification":
      return "verified";
    case "flag":
      return "warning_colorized";
    case "question":
      return "clarification";
  }
}
