import { t } from "ttag";
import validate from "metabase/lib/validate";

const ICON_OPTIONS = [
  {
    name: t`Star`,
    value: "star",
    icon: "star",
  },
  {
    name: t`Balloons`,
    value: "balloons",
    icon: "balloons",
  },
  {
    name: t`Mail`,
    value: "mail",
    icon: "mail",
  },
  {
    name: t`Warning`,
    value: "warning",
    icon: "warning",
  },
  {
    name: t`Bell`,
    value: "bell",
    icon: "bell",
  },
  {
    name: t`Cloud`,
    value: "cloud",
    icon: "cloud",
  },
];

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
    name: "default_icon",
    title: t`Default icon`,
    type: "select",
    initial: "star",
    options: ICON_OPTIONS,
    validate: validate.required(),
  },
];

export default {
  create: {
    fields: FORM_FIELDS,
  },
  edit: {
    fields: FORM_FIELDS,
  },
};
