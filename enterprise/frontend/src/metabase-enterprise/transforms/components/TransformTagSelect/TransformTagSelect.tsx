import { t } from "ttag";

import { MultiSelect } from "metabase/ui";

export function TransformTagSelect() {
  return <MultiSelect data={[]} placeholder={t`Add tags`} searchable />;
}
