import { c } from "ttag";

import * as Lib from "metabase-lib";
import type { FieldId } from "metabase-types/api";

import { formatEventName, getEventNameValue } from "./event-name";

const STAGE_INDEX = -1;

/**
 * The conditions' names joined with "and", or "" without conditions. One
 * condition on the event name is named after the event, e.g. "Signup" rather
 * than "Event name is signup".
 */
export const getConditionsName = (
  query: Lib.Query,
  eventNameFieldId?: FieldId,
): string => {
  const eventName = getEventNameValue(query, eventNameFieldId);
  if (eventName !== null) {
    return formatEventName(eventName);
  }
  const [first, ...rest] = Lib.filters(query, STAGE_INDEX).map(
    (filter) => Lib.displayInfo(query, STAGE_INDEX, filter).displayName,
  );
  return rest.reduce(
    (names, name) =>
      c("{0} is a list of conditions, {1} is one more condition")
        .t`${names} and ${name}`,
    first ?? "",
  );
};
