import React, { useCallback, useState } from "react";
import PropTypes from "prop-types";
import { t, jt } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";

import {
  explainCronExpression as _explainCronExpression,
  validateCronExpression,
} from "metabase/lib/cron";

import SettingInput from "../SettingInput";
import {
  Root,
  WidgetsRow,
  WidgetContainer,
  StyledSettingSelect,
  SelectLabel,
  CustomScheduleLabel,
  ErrorMessage,
  CronExpressionExplanation,
} from "./ModelCachingScheduleWidget.styled";

const CRON_SYNTAX_DOC_URL =
  "https://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/crontrigger.html";

function CustomScheduleInputHint() {
  const cronSyntaxDocsLink = (
    <ExternalLink
      key="doc"
      href={CRON_SYNTAX_DOC_URL}
    >{t`cron syntax`}</ExternalLink>
  );
  return (
    <CustomScheduleLabel>{jt`Enter ${cronSyntaxDocsLink} here`}</CustomScheduleLabel>
  );
}

const propTypes = {
  setting: PropTypes.object.isRequired,
  disabled: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
};

function isCustomSchedule(setting) {
  const value = setting.value || setting.default;
  const defaultSchedules = setting.options.map(o => o.value);
  return !defaultSchedules.includes(value);
}

function lowerCaseFirstLetter(str) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function explainCronExpression(expression) {
  return lowerCaseFirstLetter(_explainCronExpression(expression));
}

const PersistedModelRefreshIntervalWidget = ({
  setting,
  disabled,
  onChange,
}) => {
  const [isCustom, setCustom] = useState(isCustomSchedule(setting));
  const [customCronSchedule, setCustomCronSchedule] = useState(
    isCustom ? setting.value : "",
  );
  const [error, setError] = useState(null);

  const handleChange = useCallback(
    nextValue => {
      if (nextValue === "custom") {
        setCustom(true);
      } else {
        setCustom(false);
        setCustomCronSchedule("");
        onChange(nextValue);
      }
    },
    [onChange],
  );

  const handleCustomInputBlur = useCallback(
    cronExpression => {
      const error = validateCronExpression(cronExpression);
      setCustomCronSchedule(cronExpression);
      if (error) {
        setError(error);
      } else {
        setError(null);
        onChange(cronExpression);
      }
    },
    [onChange],
  );

  return (
    <Root>
      <WidgetsRow>
        <WidgetContainer>
          <SelectLabel>{t`Refresh models every…`}</SelectLabel>
          <StyledSettingSelect
            className="SettingsInput--short"
            setting={{
              ...setting,
              value: isCustom ? "custom" : setting.value,
              defaultValue: setting.default,
            }}
            disabled={disabled}
            onChange={handleChange}
          />
        </WidgetContainer>
        {isCustom && (
          <WidgetContainer>
            <CustomScheduleInputHint />
            <SettingInput
              disabled={disabled}
              errorMessage={error}
              setting={{
                value: customCronSchedule,
                placeholder: "For example 5   0   *   Aug   *",
              }}
              onChange={handleCustomInputBlur}
              fireOnChange={false}
            />
            {error && <ErrorMessage>{error}</ErrorMessage>}
          </WidgetContainer>
        )}
      </WidgetsRow>
      {isCustom && customCronSchedule && !error && (
        <CronExpressionExplanation>
          {t`We will refresh your models ${explainCronExpression(
            customCronSchedule,
          )}`}
        </CronExpressionExplanation>
      )}
    </Root>
  );
};

PersistedModelRefreshIntervalWidget.propTypes = propTypes;

export default PersistedModelRefreshIntervalWidget;
