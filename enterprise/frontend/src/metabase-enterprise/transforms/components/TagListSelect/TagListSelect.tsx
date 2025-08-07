import { t } from "ttag";

import { MultiSelect } from "metabase/ui";

export function TagListSelect() {
  return <MultiSelect data={[]} placeholder={t`Add tags`} searchable />;
}
