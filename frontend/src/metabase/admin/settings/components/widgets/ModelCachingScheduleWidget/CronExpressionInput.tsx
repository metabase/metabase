import cx from "classnames";
import type * as React from "react";
import { useState } from "react";
import { jt, msgid, ngettext, t } from "ttag";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import ExternalLink from "metabase/core/components/ExternalLink";
import FormS from "metabase/css/components/form.module.css";
import CS from "metabase/css/core/index.css";
import { validateCronExpression } from "metabase/lib/cron";
import { Icon } from "metabase/ui";

import S from "./CronExpressionInput.module.css";
import { CustomScheduleExplainer } from "./CustomScheduleExplainer";

type CronExpressionInputProps = {
  value: string;
  onChange: (value: string) => void;
  onBlurChange: (value: string) => void;
};

export function CronExpressionInput({
  onChange,
  onBlurChange,
  value,
}: CronExpressionInputProps) {
  const [error, setError] = useState<string | null>(null);
  const handleChange = (cronExpression: string) => {
    // We don't allow to specify "seconds" and "year" components,
    // "seconds" are mandatory for validation, so we're appending it at the beginning
    let error = validateCronExpression(`0 ${cronExpression}`);
    if (!error) {
      error = validateExpressionComponents(cronExpression);
    }
    if (error) {
      setError(error);
    } else {
      setError(null);
    }
    onChange(cronExpression);
  };

  const handleBlur = (cronExpression: string) => {
    if (!error) {
      // We don't allow to specify "seconds" and "year" components, but they're present in the value
      // and we need to append them before sending a new value to the backend
      onBlurChange(`0 ${cronExpression} *`);
    }
  };

  return (
    <>
      <CustomScheduleInputHint />
      <div className={S.inputContainer}>
        <Input
          value={value}
          hasError={!!error}
          onChange={handleChange}
          onBlurChange={handleBlur}
        />
        <CronFormatPopover>
          <Icon className={S.infoIcon} name="info" />
        </CronFormatPopover>
      </div>
      {error && <span className={S.errorMessage}>{error}</span>}
      {value && !error && <CustomScheduleExplainer cronExpression={value} />}
    </>
  );
}

function validateExpressionComponents(cronExpression: string) {
  const parts = cronExpression.split(" ");
  if (parts.length === 6 || parts.length === 7) {
    return t`Seconds and year properties are not allowed`;
  }
}

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
    <span
      className={S.customScheduleLabel}
    >{jt`Our ${cronSyntaxDocsLink} is a string of 5 fields separated by spaces`}</span>
  );
}

type InputProps = {
  value: string;
  hasError?: boolean;
  onChange: (value: string) => void;
  onBlurChange: (value: string) => void;
};

function Input({ value = "", hasError, onChange, onBlurChange }: InputProps) {
  return (
    <input
      placeholder="For example 5   0   *   Aug   ?"
      className={cx(FormS.FormInput, S.styledInput, {
        [cx(CS.borderError, CS.bgErrorInput)]: hasError,
      })}
      type="text"
      value={value}
      onChange={event => onChange(event.target.value)}
      onBlur={event => onBlurChange(event.target.value)}
    />
  );
}

function CronFormatPopover({ children }: { children: React.ReactElement }) {
  // some of these have to be plural because they're plural elsewhere and the same strings cannot be used as both
  // singular message IDs and plural message IDs
  const descriptions = [
    t`Minutes` + ": 0-59 , - * /",
    t`Hours` + ": 0-23 , - * /",
    ngettext(msgid`Day of month`, `Days of month`, 1) + ": 1-31 , - * ? / L W",
    ngettext(msgid`Month`, `Months`, 1) + ": 1-12 or JAN-DEC , - * /",
    ngettext(msgid`Day of week`, `Days of week`, 1) +
      ": 1-7 or SUN-SAT , - * ? / L #",
  ];

  return (
    <TippyPopover
      placement="top"
      content={
        <div className={S.popoverContent}>
          <span className={S.popoverTitle}>{t`Allowed values`}</span>
          {descriptions.map((text, i) => (
            <span className={S.popoverText} key={i}>
              {text}
            </span>
          ))}
        </div>
      }
    >
      {children}
    </TippyPopover>
  );
}
