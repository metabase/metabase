import React, { ReactNode, useCallback } from "react";
import { useFormikContext } from "formik";
import { t } from "ttag";
import FormField from "metabase/core/components/FormField";
import { DatabaseValues } from "../../types";
import {
  ScheduleOptionList,
  ScheduleOptionBody,
  ScheduleOptionContent,
  ScheduleOptionIndicator,
  ScheduleOptionIndicatorBackground,
  ScheduleOptionRoot,
  ScheduleOptionTitle,
} from "./DatabaseCacheScheduleField.styled";

export interface DatabaseCacheScheduleFieldProps {
  name: string;
  title?: string;
  description?: ReactNode;
  timezone: string;
}

const DatabaseCacheScheduleField = ({
  name,
  title,
  description,
  timezone,
}: DatabaseCacheScheduleFieldProps): JSX.Element => {
  const { values, setFieldValue } = useFormikContext<DatabaseValues>();

  const handleFullSyncSelect = useCallback(() => {
    setFieldValue("is_full_sync", true);
    setFieldValue("is_on_demand", false);
  }, [setFieldValue]);

  const handleOnDemandSyncSelect = useCallback(() => {
    setFieldValue("is_full_sync", false);
    setFieldValue("is_on_demand", true);
  }, [setFieldValue]);

  const handleNoneSyncSelect = useCallback(() => {
    setFieldValue("is_full_sync", false);
    setFieldValue("is_on_demand", false);
  }, [setFieldValue]);

  return (
    <FormField title={title} description={description}>
      <ScheduleOptionList>
        <ScheduleOption
          title={t`Regularly, on a schedule`}
          isSelected={values.is_full_sync}
          onSelect={handleFullSyncSelect}
        />
        <ScheduleOption
          title={t`Only when adding a new filter widget`}
          isSelected={!values.is_full_sync && values.is_on_demand}
          onSelect={handleOnDemandSyncSelect}
        />
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
    <ScheduleOptionRoot isSelected={isSelected} onClick={onSelect}>
      <ScheduleOptionIndicator isSelected={isSelected}>
        <ScheduleOptionIndicatorBackground isSelected={isSelected} />
      </ScheduleOptionIndicator>
      <ScheduleOptionBody>
        <ScheduleOptionTitle isSelected={isSelected}>
          {title}
        </ScheduleOptionTitle>
        {children && <ScheduleOptionContent>{children}</ScheduleOptionContent>}
      </ScheduleOptionBody>
    </ScheduleOptionRoot>
  );
};
