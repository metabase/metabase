import { useState } from "react";
import { jt, msgid, ngettext, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { validateCronExpression } from "metabase/lib/cron";
import { Icon, Text, TextInput, Tooltip } from "metabase/ui";

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
      <TextInput
        placeholder="For example 5   0   *   Aug   ?"
        size="lg"
        fw={600}
        error={error}
        errorProps={{ fz: ".875rem", lh: "1.3rem" }}
        type="text"
        labelProps={{ fw: 600 }}
        value={value}
        onChange={event => handleChange(event.target.value)}
        onBlur={event => handleBlur(event.target.value)}
        rightSection={<CronFormatTooltip />}
      />

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
    <Text>{jt`Our ${cronSyntaxDocsLink} is a string of 5 fields separated by spaces`}</Text>
  );
}

function CronFormatTooltip() {
  // some of these have to be plural because they're plural elsewhere and the same strings cannot be used as both
  // singular message IDs and plural message IDs
  const descriptions = [
    t`Minutes` + ": 0-59 , - * /",
    t`Hours` + ": 0-23 , - * /",
    ngettext(msgid`Day of month`, `Days of month`, 1) + ": 1-31 , - * ? / L W",
    ngettext(msgid`Month`, `Months`, 1) + `: 1-12 ${t`or`} JAN-DEC , - * /`,
    ngettext(msgid`Day of week`, `Days of week`, 1) +
      `: 1-7 ${t`or`} SUN-SAT , - * ? / L #`,
  ];

  return (
    <Tooltip
      label={
        <div>
          <Text fw="bold" c="inherit">{t`Allowed values`}</Text>
          {descriptions.map((text, i) => (
            <Text key={i} fw="normal" c="inherit">
              {text}
            </Text>
          ))}
        </div>
      }
    >
      <Icon name="info" className={S.infoIcon} />
    </Tooltip>
  );
}
