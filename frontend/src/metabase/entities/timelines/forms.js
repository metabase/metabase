import { t } from "ttag";
import { getTimelineIcons } from "metabase/lib/timeline";
import validate from "metabase/lib/validate";

const FORM_FIELDS = [
  {
    name: "name",
    title: t`Timeline name`,
    placeholder: t`Product releases`,
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
    title: t`Default icon`,
    type: "select",
    initial: "star",
    options: getTimelineIcons(),
    validate: validate.required(),
  },
  {
    name: "collection_id",
    type: "hidden",
  },
];

export default {
  collection: {
    fields: FORM_FIELDS,
  },
};
