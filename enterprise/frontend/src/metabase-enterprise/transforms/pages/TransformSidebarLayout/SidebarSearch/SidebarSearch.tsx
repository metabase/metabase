import { t } from "ttag";

import { Icon, TextInput } from "metabase/ui";

interface SidebarSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export const SidebarSearch = ({ value, onChange }: SidebarSearchProps) => {
  return (
    <TextInput
      placeholder={t`Search…`}
      leftSection={<Icon name="search" />}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};
