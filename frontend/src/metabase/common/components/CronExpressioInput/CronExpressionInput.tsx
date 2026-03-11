import { useMemo, useState } from "react";
import { jt, msgid, ngettext, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import {
  getScheduleExplanation,
  validateCronExpression,
} from "metabase/lib/cron";
import {
  Flex,
  type FlexProps,
  Icon,
  Text,
  TextInput,
  type TextProps,
  Tooltip,
} from "metabase/ui";

import S from "./CronExpressionInput.module.css";

type CronExpressionInputProps = Omit<FlexProps, "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  onBlurChange: (value: string) => void;
  getExplainMessage?: (cronExplanation: string) => string;
};

export function CronExpressionInput({
  onChange,
  onBlurChange,
  value,
  getExplainMessage,
  ...flexProps
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
    <Flex direction="column" {...flexProps}>
      <CustomScheduleInputHint />
      <TextInput
        placeholder="For example 5   0   *   Aug   ?"
        size="md"
        fw={600}
        error={error}
        errorProps={{ fz: ".875rem", lh: "1.3rem" }}
        type="text"
        labelProps={{ fw: 600 }}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={(event) => handleBlur(event.target.value)}
        rightSection={<CronFormatTooltip />}
      />

      {getExplainMessage && value && !error && (
        <CustomScheduleExplainer
          cronExpression={value}
          getExplainMessage={getExplainMessage}
        />
      )}
    </Flex>
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
    >{t`quartz cron syntax`}</ExternalLink>
  );
  return (
    <Text>{jt`Our ${cronSyntaxDocsLink} is a string of 5 fields, starting from minutes, separated by spaces`}</Text>
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

interface ScheduleExplanationProps {
  cronExpression: string;
  getExplainMessage: (cronExplanation: string) => string;
}

function CustomScheduleExplainer({
  cronExpression,
  getExplainMessage,
  ...props
}: ScheduleExplanationProps & TextProps) {
  const explanation = useMemo(
    () => getScheduleExplanation(cronExpression),
    [cronExpression],
  );

  if (!explanation) {
    return null;
  }

  return <Text {...props}>{getExplainMessage(explanation)}</Text>;
}
