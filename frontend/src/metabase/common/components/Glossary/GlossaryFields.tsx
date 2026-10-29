import cx from "classnames";
import type { KeyboardEvent, Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import {
  EditableText,
  type EditableTextProps,
} from "metabase/common/components/EditableText";
import { Group, Icon, Text } from "metabase/ui";

import S from "./Glossary.module.css";

// Paragraph line height: 21px at the 14px body size
const LINE_HEIGHT = 1.5;

type TermFieldProps = EditableTextProps & {
  isDuplicate?: boolean;
};

export const TermField = forwardRef(function TermField(
  { isDuplicate = false, ...props }: TermFieldProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <>
      <EditableText
        ref={ref}
        fz="md"
        lh={LINE_HEIGHT}
        fw="bold"
        c={isDuplicate ? "feedback-negative" : undefined}
        {...props}
      />
      {isDuplicate && (
        <Group gap="xxs" mt="xxs" wrap="nowrap" align="flex-start">
          <Icon c="text-secondary" name="info" mt="xxxs" />
          <Text c="text-secondary" fz="sm">
            {t`This term already exists in the Glossary`}
          </Text>
        </Group>
      )}
    </>
  );
});

export const DefinitionField = forwardRef(function DefinitionField(
  { className, ...props }: EditableTextProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <EditableText
      ref={ref}
      className={cx(S.definition, className)}
      fz="md"
      lh={LINE_HEIGHT}
      isMultiline
      {...props}
    />
  );
});

/** Enter commits a glossary field; Shift+Enter still inserts a line break in definitions. */
export function isCommitKey(event: KeyboardEvent) {
  return (
    event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing
  );
}

export function isDuplicateTerm(term: string, existingTerms: string[]) {
  const normalizedTerm = term.trim().toLowerCase();
  return (
    normalizedTerm !== "" &&
    existingTerms.some(
      (existingTerm) => existingTerm.toLowerCase() === normalizedTerm,
    )
  );
}

export function focusField(field: HTMLDivElement | null) {
  field?.querySelector("textarea")?.focus();
}
