import { Tabs } from "metabase/ui";
import type { ReplaceSourceErrorType } from "metabase-types/api";

import type { ReplaceSourceErrorGroup } from "../../../../types";
import { getErrorGroupLabel } from "../../../../utils";

type ErrorTypeTabsProps = {
  errorType: ReplaceSourceErrorType | undefined;
  errorGroups: ReplaceSourceErrorGroup[];
  onErrorTypeChange: (errorType: ReplaceSourceErrorType) => void;
};

export function ErrorTypeTabs({
  errorType,
  errorGroups,
  onErrorTypeChange,
}: ErrorTypeTabsProps) {
  const handleTabChange = (value: string | null) => {
    const group = errorGroups.find((group) => group.type === value);
    if (group) {
      onErrorTypeChange(group.type);
    }
  };

  return (
    <Tabs value={errorType} onChange={handleTabChange}>
      <Tabs.List>
        {errorGroups.map((errorGroup) => (
          <Tabs.Tab key={errorGroup.type} value={errorGroup.type}>
            {getErrorGroupLabel(errorGroup.type, errorGroup.count)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
