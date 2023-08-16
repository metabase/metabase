import { t } from "ttag";
import { PLUGIN_ADMIN_USER_FORM_FIELDS } from "metabase/plugins";
import validate from "metabase/lib/validate";
import FormGroupsWidget from "metabase/components/form/widgets/FormGroupsWidget";

export default {
  admin: {
    fields: [
      {
        name: "first_name",
        title: t`First name`,
        placeholder: t`Johnny`,
        autoFocus: true,
        validate: validate.maxLength(100),
        normalize: firstName => firstName || null,
      },
      {
        name: "last_name",
        title: t`Last name`,
        placeholder: t`Appleseed`,
        validate: validate.maxLength(100),
        normalize: lastName => lastName || null,
      },
      {
        name: "email",
        title: t`Email`,
        placeholder: t`nicetoseeyou@email.com`,
        validate: validate.required().email(),
      },
      {
        name: "user_group_memberships",
        title: t`Groups`,
        type: FormGroupsWidget,
      },
      ...PLUGIN_ADMIN_USER_FORM_FIELDS,
    ],
  },
};
