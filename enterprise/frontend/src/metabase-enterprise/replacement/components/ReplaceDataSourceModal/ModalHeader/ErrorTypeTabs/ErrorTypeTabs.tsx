import { Tabs } from "metabase/ui";
import type {
  ReplaceSourceError,
  ReplaceSourceErrorType,
} from "metabase-types/api";

import { getErrorGroupLabel } from "../../../../utils";

import S from "./ErrorTypeTabs.module.css";

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
  const handleTabChange = (value: string | null) => {
    const newError = errors.find((error) => error.type === value);
    if (newError != null) {
      onErrorTypeChange(newError.type);
    }
  };

  return (
    <Tabs value={errorType} onChange={handleTabChange}>
      <Tabs.List className={S.tabList}>
        {errors.map((error) => (
          <Tabs.Tab key={error.type} value={error.type}>
            {getErrorGroupLabel(error.type, error.columns.length)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
