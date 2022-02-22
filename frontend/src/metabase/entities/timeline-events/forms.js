import moment from "moment";
import { t } from "ttag";
import { hasTimePart } from "metabase/lib/time";
import { getTimelineIcons } from "metabase/lib/timeline";
import validate from "metabase/lib/validate";

const createForm = () => {
  return [
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
};

const normalizeForm = timeline => {
  const timestamp = moment.parseZone(timeline.timestamp);

  return {
    ...timeline,
    time_matters: hasTimePart(timestamp),
  };
};

export default {
  collection: {
    fields: createForm,
    normalize: normalizeForm,
  },
};
