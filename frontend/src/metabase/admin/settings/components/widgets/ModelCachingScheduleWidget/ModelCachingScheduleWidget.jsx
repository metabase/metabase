import React from "react";
import PropTypes from "prop-types";
import { t, jt } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";

import SettingInput from "../SettingInput";
import {
  Root,
  WidgetContainer,
  StyledSettingSelect,
  SelectLabel,
  CustomScheduleLabel,
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

const PersistedModelRefreshIntervalWidget = ({
  setting,
  disabled,
  onChange,
}) => {
  const [isCustom, setCustom] = React.useState(isCustomSchedule(setting));
  const [customCronSchedule, setCustomCronSchedule] = React.useState(
    isCustom ? setting.value : "",
  );

  const handleChange = React.useCallback(
    nextValue => {
      if (nextValue === "custom") {
        setCustom(true);
      } else {
        setCustom(false);
        onChange(nextValue);
      }
    },
    [onChange],
  );

  return (
    <Root>
      <WidgetContainer>
        <SelectLabel>{t`Refresh models every…`}</SelectLabel>
        <StyledSettingSelect
          className="SettingsInput--short"
          setting={{ ...setting, defaultValue: setting.default }}
          disabled={disabled}
          onChange={handleChange}
        />
      </WidgetContainer>
      {isCustom && (
        <WidgetContainer>
          <CustomScheduleInputHint />
          <SettingInput
            setting={{
              value: customCronSchedule,
              placeholder: "For example 5   0   *   Aug   *",
            }}
            onChange={setCustomCronSchedule}
          />
        </WidgetContainer>
      )}
    </Root>
  );
};

PersistedModelRefreshIntervalWidget.propTypes = propTypes;

export default PersistedModelRefreshIntervalWidget;
