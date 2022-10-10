export const hasLinkDestination = (clickBehavior: any) =>
  clickBehavior.type === "link" &&
  clickBehavior.linkType &&
  (clickBehavior.targetId || clickBehavior.linkTemplate);
