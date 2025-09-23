import { t } from "ttag";

import { Alert, type AlertProps } from "metabase/ui";

type Props = Omit<AlertProps, "title" | "children">;

export const NamingTip = (props: Props) => (
  <Alert title={t`Tip`} {...props}>
    {t`You might want to update the field name to make sure it still makes sense based on your remapping choices.`}
  </Alert>
);
