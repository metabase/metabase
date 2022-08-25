import { t } from "ttag";
import { getTimelineIcons, getTimelineName } from "metabase/lib/timelines";
import validate from "metabase/lib/validate";

const createForm = ({ timelines }) => {
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
      hasTimeField: "time_matters",
      validate: validate.required(),
    },
    {
      name: "description",
      title: t`Description`,
      type: "text",
      validate: validate.maxLength(255),
      infoLabel: t`Markdown supported`,
      infoLabelTooltip: t`Add links and formatting via markdown`,
    },
    {
      name: "icon",
      title: t`Icon`,
      type: "select",
      options: getTimelineIcons(),
      validate: validate.required(),
    },
    {
      name: "timeline_id",
      title: t`Timeline`,
      type: timelines.length > 1 ? "select" : "hidden",
      options: timelines.map(t => ({ name: getTimelineName(t), value: t.id })),
    },
    {
      name: "source",
      type: "hidden",
    },
    {
      name: "question_id",
      type: "hidden",
    },
    {
      name: "timezone",
      type: "hidden",
    },
    {
      name: "time_matters",
      type: "hidden",
    },
  ];
};

export default {
  details: ({ timelines = [] } = {}) => ({
    fields: createForm({ timelines }),
  }),
};
