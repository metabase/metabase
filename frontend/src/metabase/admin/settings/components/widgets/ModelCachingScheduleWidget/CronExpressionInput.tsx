import cx from "classnames";
import type * as React from "react";
import { useCallback, useState } from "react";
import { t, jt } from "ttag";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import ExternalLink from "metabase/core/components/ExternalLink";
import FormS from "metabase/css/components/form.module.css";
import CS from "metabase/css/core/index.css";
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
    <CustomScheduleLabel>{jt`Our ${cronSyntaxDocsLink} is a string of 5 fields separated by spaces`}</CustomScheduleLabel>
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
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange(event.target.value),
    [onChange],
  );

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) =>
      onBlurChange(event.target.value),
    [onBlurChange],
  );

  return (
    <StyledInput
      {...props}
      className={cx(
        FormS.FormInput,
        {
          [cx(CS.borderError, CS.bgErrorInput)]: hasError,
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
    },
    [onChange],
  );

  const handleBlur = useCallback(
    (cronExpression: string) => {
      if (!error) {
        // We don't allow to specify "seconds" and "year" components, but they're present in the value
        // and we need to append them before sending a new value to the backend
        onBlurChange(`0 ${cronExpression} *`);
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CronExpressionInput;
