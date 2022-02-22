import { t } from "ttag";
import { getDefaultTimezone } from "metabase/lib/time";
import { getTimelineIcons } from "metabase/lib/timeline";
import validate from "metabase/lib/validate";

const FORM_FIELDS = [
  {
    name: "name",
    title: t`Event name`,
    placeholder: t`Product launch`,
    autoFocus: true,
    validate: validate.required().maxLength(255),
  },
  {
    name: "timestamp",
    title: t`Date`,
    type: "date",
    hasTime: true,
    hasTimezone: true,
    timezoneFieldName: "timezone",
    validate: validate.required(),
  },
  {
    name: "description",
    title: t`Description`,
    type: "text",
    validate: validate.maxLength(255),
  },
  {
    name: "icon",
    title: t`Icon`,
    type: "select",
    initial: "star",
    options: getTimelineIcons(),
    validate: validate.required(),
  },
  {
    name: "timezone",
    type: "hidden",
    initial: getDefaultTimezone(),
  },
  {
    name: "time_matters",
    type: "hidden",
    initial: false,
  },
  {
    name: "timeline_id",
    type: "hidden",
  },
];

export default {
  collection: {
    fields: FORM_FIELDS,
  },
};
