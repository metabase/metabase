import { t } from "ttag";
import _ from "underscore";

import type { CardError } from "metabase-types/api";

const ERROR_DICTIONARY = {
  "inactive-field": {
    entity: t`Field`,
    messageProp: "field" as const,
    problem: t`is inactive`,
  },
  "unknown-field": {
    entity: t`Field`,
    messageProp: "field" as const,
    problem: t`is unknown`,
  },
  "inactive-table": {
    entity: t`Table`,
    messageProp: "table" as const,
    problem: t`is inactive`,
  },
  "unknown-table": {
    entity: t`Table`,
    messageProp: "table" as const,
    problem: t`is unknown`,
  },
};

const errorTypes = Object.keys(
  ERROR_DICTIONARY,
) as (keyof typeof ERROR_DICTIONARY)[];

export const formatErrorString = (errors: CardError[]) => {
  const messages: string[] = [];

  const errorsByType = _.groupBy(errors, "type");

  errorTypes.forEach(errorType => {
    if (errorsByType[errorType]) {
      const errorDef = ERROR_DICTIONARY[errorType];

      messages.push(
        `${errorDef.entity} ${errorsByType[errorType]
          .map(error => error[errorDef.messageProp])
          .join(", ")} ${errorDef.problem}`,
      );
    }
  });

  if (messages.length > 0) {
    return messages.join(", ");
  } else {
    return t`Unknown data reference`;
  }
};
