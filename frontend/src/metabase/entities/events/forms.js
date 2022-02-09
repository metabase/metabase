import { t } from "ttag";
import { ICONS } from "metabase/lib/events";
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
    options: ICONS,
    validate: validate.required(),
  },
];

export default {
  collection: {
    fields: FORM_FIELDS,
  },
};
