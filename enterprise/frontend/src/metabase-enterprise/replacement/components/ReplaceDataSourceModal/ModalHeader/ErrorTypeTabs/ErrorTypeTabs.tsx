import { useMemo } from "react";

import { Tabs } from "metabase/ui";
import type {
  ReplaceSourceError,
  ReplaceSourceErrorType,
} from "metabase-types/api";

import S from "./ErrorTypeTabs.module.css";
import { getErrorGroupLabel, getErrorGroups } from "./utils";

type ErrorTypeTabsProps = {
  errors: ReplaceSourceError[];
  errorType: ReplaceSourceErrorType | undefined;
  onErrorTypeChange: (errorType: ReplaceSourceErrorType) => void;
};

export function ErrorTypeTabs({
  errors,
  errorType,
  onErrorTypeChange,
}: ErrorTypeTabsProps) {
  const errorGroups = useMemo(() => getErrorGroups(errors), [errors]);

  const handleTabChange = (value: string | null) => {
    const group = errorGroups.find((group) => group.type === value);
    if (group) {
      onErrorTypeChange(group.type);
    }
  };

  return (
    <Tabs value={errorType} onChange={handleTabChange}>
      <Tabs.List className={S.tabList}>
        {errorGroups.map((errorGroup) => (
          <Tabs.Tab key={errorGroup.type} value={errorGroup.type}>
            {getErrorGroupLabel(errorGroup.type, errorGroup.count)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
