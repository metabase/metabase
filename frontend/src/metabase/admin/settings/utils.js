// in order to prevent collection of identifying information only fields
// that are explicitly marked as collectable or booleans should show the true value
export const prepareAnalyticsValue = setting =>
  setting.allowValueCollection || setting.type === "boolean"
    ? setting.value
    : "success";
