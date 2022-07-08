import React, { useCallback, useState } from "react";
import cx from "classnames";
import { t, jt } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import TippyPopover from "metabase/components/Popover/TippyPopover";

import { validateCronExpression } from "metabase/lib/cron";

import {
  CustomScheduleLabel,
  ErrorMessage,
  InputContainer,
  InfoIcon,
  StyledInput,
  PopoverContent,
  PopoverTitle,
  PopoverText,
} from "./CronExpressionInput.styled";

function validateExpressionHasNoYearComponent(cronExpression: string) {
  const parts = cronExpression.split(" ");
  if (parts.length === 7) {
    return t`Year property is not configurable`;
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
    <CustomScheduleLabel>{jt`Our ${cronSyntaxDocsLink} is a string of 5 fields separated by white spaces`}</CustomScheduleLabel>
  );
}

type InputProps = {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
  onChange: (value: string) => void;
  onBlurChange: (value: string) => void;
};

function Input({
  value = "",
  hasError,
  className,
  onChange,
  onBlurChange,
  ...props
}: InputProps) {
  const handleChange = useCallback(event => onChange(event.target.value), [
    onChange,
  ]);

  const handleBlur = useCallback(event => onBlurChange(event.target.value), [
    onBlurChange,
  ]);

  return (
    <StyledInput
      {...props}
      className={cx(
        "Form-input",
        {
          "border-error bg-error-input": hasError,
        },
        className,
      )}
      type="text"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}

function CronFormatPopover({ children }: { children: React.ReactElement }) {
  const descriptions = [
    t`Minutes` + ": 0-59 , - * /",
    t`Hours` + ": 0-23 , - * /",
    t`Day of month` + ": 1-31 , - * ? / L W",
    t`Month` + ": 1-12 or JAN-DEC , - * /",
    t`Day of week` + ": 1-7 or SUN-SAT , - * ? / L #",
  ];

  return (
    <TippyPopover
      placement="top"
      content={
        <PopoverContent>
          <PopoverTitle>{t`Allowed values`}</PopoverTitle>
          {descriptions.map((text, i) => (
            <PopoverText key={i}>{text}</PopoverText>
          ))}
        </PopoverContent>
      }
    >
      {children}
    </TippyPopover>
  );
}

function CronExpressionInput({ onChange, onBlurChange, ...props }: InputProps) {
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (cronExpression: string) => {
      let error = validateCronExpression(cronExpression);
      if (!error) {
        error = validateExpressionHasNoYearComponent(cronExpression);
      }
      if (error) {
        setError(error);
      } else {
        setError(null);
      }
      onChange(cronExpression);
    },
    [onChange],
  );

  const handleBlur = useCallback(
    (cronExpression: string) => {
      if (!error) {
        // We don't allow to specify the "year" component, but it's present in the value
        // and we need to append it before sending a new value to the backend
        onBlurChange(`${cronExpression} *`);
      }
    },
    [error, onBlurChange],
  );

  return (
    <>
      <CustomScheduleInputHint />
      <InputContainer>
        <Input
          {...props}
          hasError={!!error}
          onChange={handleChange}
          onBlurChange={handleBlur}
        />
        <CronFormatPopover>
          <InfoIcon name="info" />
        </CronFormatPopover>
      </InputContainer>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </>
  );
}

export default CronExpressionInput;
