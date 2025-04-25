import { useField, useFormikContext } from "formik";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import SchedulePicker from "metabase/components/SchedulePicker";
import FormField from "metabase/core/components/FormField";
import type {
  DatabaseData,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

import {
  ScheduleOptionBody,
  ScheduleOptionContent,
  ScheduleOptionIndicator,
  ScheduleOptionIndicatorBackground,
  ScheduleOptionList,
  ScheduleOptionRoot,
  ScheduleOptionText,
  ScheduleOptionTitle,
} from "./DatabaseCacheScheduleField.styled";

const DEFAULT_SCHEDULE: ScheduleSettings = {
  schedule_day: "mon",
  schedule_frame: null,
  schedule_hour: 0,
  schedule_type: "daily",
};

const SCHEDULE_OPTIONS: ScheduleType[] = ["daily", "weekly", "monthly"];

export interface DatabaseCacheScheduleFieldProps {
  name: string;
  title?: string;
  description?: ReactNode;
}

const DatabaseCacheScheduleField = ({
  name,
  title,
  description,
}: DatabaseCacheScheduleFieldProps): JSX.Element => {
  const { values, setFieldValue } = useFormikContext<DatabaseData>();
  const [{ value }, , { setValue }] = useField(name);

  const handleScheduleChange = useCallback(
    (value: ScheduleSettings) => {
      setValue(value);
    },
    [setValue],
  );

  const handleFullSyncSelect = useCallback(() => {
    setFieldValue("is_full_sync", true);
    setFieldValue("is_on_demand", false);
    const isChangingOption = !values.is_full_sync;
    if (isChangingOption) {
      // We only want to set the default schedule if user is changing a schedule option.
      setValue(DEFAULT_SCHEDULE);
    } else {
      // "Regularly, on a schedule" ScheduleOption has a form inside.
      // Interacting with form elements causes this handleFullSyncSelect handler to be called.
      // We don't want to reset schedule state in this case.
    }
  }, [setFieldValue, setValue, values]);

  const handleOnDemandSyncSelect = useCallback(() => {
    setFieldValue("is_full_sync", false);
    setFieldValue("is_on_demand", true);
    setValue(null);
  }, [setFieldValue, setValue]);

  const handleNoneSyncSelect = useCallback(() => {
    setFieldValue("is_full_sync", false);
    setFieldValue("is_on_demand", false);
    setValue(null);
  }, [setFieldValue, setValue]);

  return (
    <FormField title={title} description={description}>
      <ScheduleOptionList>
        <ScheduleOption
          title={t`Regularly, on a schedule`}
          isSelected={values.is_full_sync}
          onSelect={handleFullSyncSelect}
        >
          <SchedulePicker
            schedule={value ?? DEFAULT_SCHEDULE}
            scheduleOptions={SCHEDULE_OPTIONS}
            onScheduleChange={handleScheduleChange}
          />
        </ScheduleOption>
        <ScheduleOption
          title={t`Only when adding a new filter widget`}
          isSelected={!values.is_full_sync && values.is_on_demand}
          onSelect={handleOnDemandSyncSelect}
        >
          <ScheduleOptionText>
            {/* eslint-disable-next-line no-literal-metabase-strings -- Metabase settings */}
            {t`When a user adds a new filter to a dashboard or a SQL question, Metabase will scan the field(s) mapped to that filter in order to show the list of selectable values.`}
          </ScheduleOptionText>
        </ScheduleOption>
        <ScheduleOption
          title={t`Never, I'll do this manually if I need to`}
          isSelected={!values.is_full_sync && !values.is_on_demand}
          onSelect={handleNoneSyncSelect}
        />
      </ScheduleOptionList>
    </FormField>
  );
};

interface ScheduleOptionProps {
  title: string;
  isSelected: boolean;
  children?: ReactNode;
  onSelect: () => void;
}

const ScheduleOption = ({
  title,
  isSelected,
  children,
  onSelect,
}: ScheduleOptionProps): JSX.Element => {
  return (
    <ScheduleOptionRoot
      isSelected={isSelected}
      role="option"
      aria-label={title}
      aria-selected={isSelected}
      onClick={onSelect}
    >
      <ScheduleOptionIndicator isSelected={isSelected}>
        <ScheduleOptionIndicatorBackground isSelected={isSelected} />
      </ScheduleOptionIndicator>
      <ScheduleOptionBody>
        <ScheduleOptionTitle isSelected={isSelected}>
          {title}
        </ScheduleOptionTitle>
        {children && isSelected && (
          <ScheduleOptionContent>{children}</ScheduleOptionContent>
        )}
      </ScheduleOptionBody>
    </ScheduleOptionRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseCacheScheduleField;
