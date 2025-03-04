import { useCallback, useState } from "react";
import { t } from "ttag";

import { Select } from "metabase/ui";

import { CronExpressionInput } from "./CronExpressionInput";
import S from "./ModelCachingScheduleWidget.module.css";

interface ModelCachingScheduleWidgetProps {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

const DEFAULT_CUSTOM_SCHEDULE = "0 * * * ?";

function formatCronExpression(cronExpression: string): string {
  const [, ...partsWithoutSeconds] = cronExpression.split(" ");
  const partsWithoutSecondsAndYear = partsWithoutSeconds.slice(0, -1);
  return partsWithoutSecondsAndYear.join(" ");
}

function isCustomSchedule(
  value: string,
  options: Array<{ value: string; label: string }>,
) {
  const defaultSchedules = options.map(o => o.value);
  return !defaultSchedules.includes(value);
}

export const ModelCachingScheduleWidget = ({
  value,
  options,
  onChange,
}: ModelCachingScheduleWidgetProps) => {
  const [isCustom, setCustom] = useState(isCustomSchedule(value, options));
  const [customCronSchedule, setCustomCronSchedule] = useState<string>(
    // We don't allow to specify the "year" component, but it's present in the value
    // So we need to cut it visually to avoid confusion
    isCustom ? formatCronExpression(value) : "",
  );

  const handleScheduleChange = useCallback(
    (nextValue: string) => {
      if (nextValue === "custom") {
        setCustom(true);
        setCustomCronSchedule(DEFAULT_CUSTOM_SCHEDULE);
        onChange(`0 ${DEFAULT_CUSTOM_SCHEDULE} *`);
      } else {
        setCustom(false);
        setCustomCronSchedule("");
        onChange(nextValue);
      }
    },
    [onChange],
  );

  return (
    <div className={S.root}>
      <div className={S.widgetsRow}>
        <div className={S.widgetContainer}>
          <span className={S.selectLabel}>{t`Refresh models every…`}</span>
          <Select
            className={S.styledSettingSelect}
            value={isCustom ? "custom" : value}
            onChange={handleScheduleChange}
            data={options}
          />
        </div>
        {isCustom && customCronSchedule !== undefined && (
          <div className={S.widgetContainer}>
            <CronExpressionInput
              value={customCronSchedule}
              onChange={setCustomCronSchedule}
              onBlurChange={onChange}
            />
          </div>
        )}
      </div>
    </div>
  );
};
