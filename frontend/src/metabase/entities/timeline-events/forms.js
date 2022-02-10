import { t } from "ttag";
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
    placeholder: "2022-01-01T10:20:30.000000Z",
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
];

export default {
  collection: {
    fields: FORM_FIELDS,
  },
};
