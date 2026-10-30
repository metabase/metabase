import cx from "classnames";
import type { Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import { Text, Textarea, type TextareaProps } from "metabase/ui";

import S from "./Glossary.module.css";

const LINE_HEIGHT = 1.5;
const DEFINITION_MAX_WIDTH = 600;
const FIELD_PADDING = "var(--mantine-spacing-xxs)";
// An input's padding plus its 1px border, so read-only text lines up with editable text
const READ_ONLY_PADDING = `calc(${FIELD_PADDING} + 1px)`;
// Lifts the theme's 6-row cap so long definitions show in full
const UNLIMITED_ROWS = Infinity;

type GlossaryFieldProps = Omit<TextareaProps, "value" | "onChange"> & {
  value: string;
  withBorder?: boolean;
  isBold?: boolean;
  onChange?: (value: string) => void;
};

type TermFieldProps = GlossaryFieldProps & {
  isDuplicate?: boolean;
};

export const TermField = forwardRef(function TermField(
  { isDuplicate = false, ...props }: TermFieldProps,
  ref: Ref<HTMLTextAreaElement>,
) {
  return (
    <GlossaryField
      ref={ref}
      aria-label={t`Term`}
      isBold
      error={isDuplicate && t`This term already exists in the Glossary`}
      {...props}
    />
  );
});

export const DefinitionField = forwardRef(function DefinitionField(
  props: GlossaryFieldProps,
  ref: Ref<HTMLTextAreaElement>,
) {
  return (
    <GlossaryField
      ref={ref}
      aria-label={t`Definition`}
      maw={DEFINITION_MAX_WIDTH}
      {...props}
    />
  );
});

const GlossaryField = forwardRef(function GlossaryField(
  {
    value,
    withBorder = false,
    isBold = false,
    readOnly,
    maw,
    onChange,
    ...props
  }: GlossaryFieldProps,
  ref: Ref<HTMLTextAreaElement>,
) {
  if (readOnly) {
    return (
      <Text
        className={cx(S.readOnlyValue, { [S.bold]: isBold })}
        fz="md"
        lh={LINE_HEIGHT}
        p={READ_ONLY_PADDING}
        maw={maw}
      >
        {value}
      </Text>
    );
  }

  return (
    <Textarea
      ref={ref}
      classNames={{
        input: cx(S.input, {
          [S.bordered]: withBorder,
          [S.bold]: isBold,
        }),
      }}
      styles={{
        input: {
          lineHeight: LINE_HEIGHT,
          padding: FIELD_PADDING,
          // Mantine floors an input at --input-height; Textarea drops the vars prop and autosize rejects an inline minHeight
          "--input-height": 0,
        },
      }}
      variant="unstyled"
      maw={maw}
      value={value}
      minRows={1}
      maxRows={UNLIMITED_ROWS}
      onChange={(event) => onChange?.(event.currentTarget.value)}
      {...props}
    />
  );
});
