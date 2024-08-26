import type { CreateTimelineRequest } from "metabase-types/api";

export const createTimeline = ({
  name = "Timeline",
  icon = "star",
  default: isDefault = false,
  archived = false,
  ...params
}: CreateTimelineRequest) => {
  return cy.request("POST", "/api/timeline", {
    ...params,
    name,
    icon,
    default: isDefault,
    archived,
  });
};
