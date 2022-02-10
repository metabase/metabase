import { t } from "ttag";
import { getEventIcons } from "metabase/lib/timeline";
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
    options: getEventIcons(),
    validate: validate.required(),
  },
];

export default {
  collection: {
    fields: FORM_FIELDS,
  },
};
