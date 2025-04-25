import type { ChangeEvent } from "react";
import { t } from "ttag";

import { Switch } from "metabase/ui";

interface Props {
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export const TableVisibilityInput = ({ checked, onChange }: Props) => (
  <Switch
    checked={checked}
    label={t`Hide this table`}
    size="sm"
    onChange={onChange}
  />
);
