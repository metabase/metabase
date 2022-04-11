import { t } from "ttag";
import { getTimelineIcons } from "metabase/lib/timelines";
import validate from "metabase/lib/validate";

const createForm = () => {
  return [
    {
      name: "name",
      title: t`Name`,
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
      options: getTimelineIcons(),
      validate: validate.required(),
    },
    {
      name: "collection_id",
      type: "hidden",
    },
    {
      name: "default",
      type: "hidden",
    },
  ];
};

export default {
  details: {
    fields: createForm(),
  },
};
