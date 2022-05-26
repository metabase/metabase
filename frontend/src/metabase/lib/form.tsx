import React from "react";

import { identity } from "lodash";
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
    .filter(identity) as string[];

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
  // exit condition
  const isFieldTitlesExhausted = fieldTitles.length === 0;
  if (isFieldTitlesExhausted) {
    // eslint-disable-next-line react/jsx-key
    return [<span>{message}</span>];
  }

  const [fieldTitle, ...restFieldTitles] = fieldTitles;
  const fieldIndex = message.toLowerCase().indexOf(fieldTitle.toLowerCase());
  if (isFieldFounded(fieldIndex, message, fieldTitle)) {
    const endOfFieldIndex = fieldIndex + fieldTitle.length;
    const [beforeField, field, afterField] = [
      message.slice(0, fieldIndex),
      message.slice(fieldIndex, endOfFieldIndex),
      message.slice(endOfFieldIndex),
    ];

    return [
      ...tokenizeErrorMessage(beforeField, restFieldTitles),
      // eslint-disable-next-line react/jsx-key
      <strong>{field}</strong>,
      // Tokenize the same field again because there could exists the same field multiple times.
      ...tokenizeErrorMessage(afterField, fieldTitles),
    ];
  } else {
    return tokenizeErrorMessage(message, restFieldTitles);
  }
}

function isFieldFounded(
  fieldIndex: number,
  message: string,
  fieldTitle: string,
): boolean {
  if (fieldIndex < 0) {
    return false;
  }

  const isWholeWord =
    [undefined, " "].includes(message[fieldIndex - 1]) &&
    [undefined, " "].includes(message[fieldIndex + fieldTitle.length]);

  return isWholeWord;
}
