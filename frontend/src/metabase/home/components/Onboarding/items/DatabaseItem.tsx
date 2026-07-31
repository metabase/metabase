import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Text } from "metabase/ui";

import { ChecklistImage, ChecklistItem } from "../ChecklistItem";
import type { OnboardingItemProps } from "../types";

export const DatabaseItem = ({ value, itemRef }: OnboardingItemProps) => {
  const applicationName = useSelector(getApplicationName);

  return (
    <ChecklistItem
      value={value}
      itemRef={itemRef}
      icon="add_data"
      label={t`Connect ${applicationName} to your data`}
      actions={[
        {
          label: t`Add database`,
          to: "/admin/databases/create",
          cta: "primary",
        },
      ]}
    >
      <ChecklistImage
        alt={`${applicationName} ${t`data stack`}`}
        src="app/assets/img/onboarding_data_diagram.png"
        srcSet="app/assets/img/onboarding_data_diagram@2x.png 2x"
      />
      <Text>
        {t`Connect one or more databases. You can query these databases directly, either with the query builder or the native SQL editor.`}
      </Text>
    </ChecklistItem>
  );
};
