import React from "react";

import _ from "lodash";
import { BaseFieldDefinition } from "metabase-types/forms";
import { ReactNode } from "react-markdown";

export function getErrorMessageWithBoldFields(
  message?: string,
  formFields?: BaseFieldDefinition[],
): ReactNode | undefined {
  if (!message) {
    return undefined;
  }

  const fieldTitles = (formFields || [])
    .map(formField => formField.title)
    .filter(_.identity) as string[];

  if (fieldTitles.length === 0) {
    return message;
  }

  const tokenizedMessage = tokenizeErrorMessage(message, fieldTitles);
  const hasBoldFields = tokenizedMessage.length > 1;
  if (hasBoldFields) {
    return tokenizedMessage;
  } else {
    return message;
  }
}

function tokenizeErrorMessage(
  message: string,
  fieldTitles: string[],
): ReactNode[] {
  const tokenizedMessage: ReactNode[] = [];
  let currentIndex = 0;

  const matches = Array.from(
    message.matchAll(new RegExp(fieldTitles.join("|"), "ig")),
  );
  // RegExp should already return sorted matched token.
  // But I sorted the result, since I'm not sure about the actual outcome.
  matches.sort((a, b) => (a.index as number) - (b.index as number));
  matches.forEach(match => {
    const index = match.index as number;

    const stringBeforeToken = message.slice(currentIndex, index);
    tokenizedMessage.push(<span>{stringBeforeToken}</span>);

    const field = match[0];
    tokenizedMessage.push(<strong>{field}</strong>);

    currentIndex = index + field.length;
  });
  tokenizedMessage.push(<span>{message.slice(currentIndex)}</span>);

  return tokenizedMessage;
}
