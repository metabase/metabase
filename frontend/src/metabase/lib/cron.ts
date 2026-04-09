import { isValidCronExpression } from "cron-expression-validator";
import cronstrue from "cronstrue";
import { t } from "ttag";
import { memoize } from "underscore";

import MetabaseSettings from "metabase/lib/settings";
import { has24HourModeSetting } from "metabase/lib/time-dayjs";

function translateErrorMessage(message: string) {
  const errorMessageMap: Record<string, string> = {
    "Day-of-Week values must be between 1 and 7": t`Day-of-week values must be between 1 and 7`,
    "Day-of-Week values must be SUN, MON, TUE, WED, THU, FRI, SAT OR between 1 and 7, - * ? / L #": t`Day-of-week values must be SUN, MON, TUE, WED, THU, FRI, SAT OR between 1 and 7, - * ? / L #`,
    "(Day of week) - Unsupported value for field. Possible values are 1-7 or SUN-SAT , - * ? / L #": t`Unsupported day of week value. Possible values are 1-7 or SUN-SAT , - * ? / L #`,
    "A numeric value between 1 and 5 must follow the # option": t`A numeric value between 1 and 5 must follow the # option`,
    "Day of month values must be between 1 and 31": t`Day of month values must be between 1 and 31`,
    "Offset from last day must be <= 30": t`Offset from last day must be less or equal 30`,
    "Month values must be between 1 and 12": t`Month values must be between 1 and 12`,
    "Month values must be JAN, FEB, MAR, APR, MAY, JUN, JUL, AUG, SEP, OCT, NOV, DEC OR between 1 and 12": t`Month values must be JAN, FEB, MAR, APR, MAY, JUN, JUL, AUG, SEP, OCT, NOV, DEC or between 1 and 12`,
    "Start year must be less than stop year": t`Start year must be less than stop year`,
    "(Year) - Unsupported value for field. Possible values are 1970-2099 , - * /": t`Unsupported year value. Possible values are 1970-2099 , - * /`,
    "Minute and Second values must be between 0 and 59 and Hour Values must be between 0 and 23": t`Minute and second values must be between 0 and 59 and hour values must be between 0 and 23`,
    "? can only be specified for Day-of-Month -OR- Day-of-Week": t`You must use ? in the day-of-week or day-of-month field`,
    "Unexpected end of expression": t`Invalid cron expression`,
  };
  // Some messages are dynamic and do not have translation mapping,
  // so we've decided to return them as is.
  return errorMessageMap[message] || message;
}

export function validateCronExpression(
  cronExpression: string,
): string | undefined {
  const result = isValidCronExpression<boolean>(cronExpression, {
    error: true,
  });

  if (result === true) {
    return;
  }

  if (result === false) {
    return t`Invalid cron expression`;
  }

  const { errorMessage } = result;
  if (typeof errorMessage === "string") {
    return translateErrorMessage(errorMessage) || t`Invalid cron expression`;
  }

  // Picking up the last error message
  // as a workaround for https://github.com/anushaihalapathirana/cron-expression-validator/issues/17
  // For some reason, cron-expression-validator uses a global `errorMessages` variable,
  // and it's value is preserved between validation calls
  // So the most relevant message is always pushed to the end of the list
  const [lastErrorMessage] = errorMessage
    .map(translateErrorMessage)
    .filter(Boolean)
    .reverse();

  return lastErrorMessage || t`Invalid cron expression`;
}

export function explainCronExpression(cronExpression: string) {
  return cronstrue.toString(cronExpression, {
    verbose: false,
    locale: MetabaseSettings.get("site-locale"),
    use24HourTimeFormat: has24HourModeSetting(),
    dayOfWeekStartIndexZero: false,
  });
}

function lowerCaseFirstLetter(str: string) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export const getScheduleExplanation = memoize(
  (cronExpression: string): string | null => {
    try {
      const readableSchedule = lowerCaseFirstLetter(
        explainCronExpression(cronExpression),
      );
      return readableSchedule;
    } catch {
      return null;
    }
  },
);

// Remove seconds and years
export function formatCronExpressionForUI(cronExpression: string): string {
  const [, ...partsWithoutSeconds] = cronExpression.split(" ");
  const partsWithoutSecondsAndYear = partsWithoutSeconds.slice(0, -1);
  return partsWithoutSecondsAndYear.join(" ");
}
