import type {
  ChangeEvent,
  FocusEvent,
  FocusEventHandler,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  Ref,
} from "react";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { usePrevious } from "react-use";

import Markdown from "metabase/core/components/Markdown";
import { MaybeTranslationCannotBeEditedHoverCard } from "metabase/i18n/MaybeTranslationCannotBeEditedHoverCard";
import { Box } from "metabase/ui";

import { EditableTextArea, EditableTextRoot } from "./EditableText.styled";

export type EditableTextAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "onFocus" | "onBlur"
>;

export interface EditableTextProps extends EditableTextAttributes {
  initialValue?: string | null;
  isLocalized?: boolean;
  placeholder?: string;
  isEditing?: boolean;
  isOptional?: boolean;
  isMultiline?: boolean;
  isDisabled?: boolean;
  isMarkdown?: boolean;
  onChange?: (value: string) => void;
  onFocus?: FocusEventHandler<HTMLTextAreaElement>;
  onBlur?: FocusEventHandler<HTMLTextAreaElement>;
  "data-testid"?: string;
}

const EditableText = forwardRef(function EditableText(
  {
    initialValue,
    isLocalized = false,
    placeholder,
    isEditing = false,
    isOptional = false,
    isMultiline = false,
    isDisabled = false,
    isMarkdown = false,
    onChange,
    onFocus,
    onBlur,
    "data-testid": dataTestId,
    ...props
  }: EditableTextProps,
  ref: Ref<HTMLDivElement>,
) {
  const [inputValue, setInputValue] = useState(initialValue ?? "");
  const [submitValue, setSubmitValue] = useState(initialValue ?? "");
  const [isInFocus, setIsInFocus] = useState(isEditing);
  const displayValue = initialValue || placeholder || "";

  const submitOnBlur = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousInitialValue = usePrevious(initialValue);

  useEffect(() => {
    if (initialValue && initialValue !== previousInitialValue) {
      setInputValue(initialValue);
    }
  }, [initialValue, previousInitialValue]);

  useEffect(() => {
    if (!isMarkdown) {
      return;
    }

    if (isInFocus) {
      inputRef.current?.focus();
    }
  }, [isInFocus, isMarkdown]);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLTextAreaElement>) => {
      setIsInFocus(false);

      if (!isOptional && !inputValue) {
        setInputValue(submitValue);
      } else if (inputValue !== submitValue && submitOnBlur.current) {
        setSubmitValue(inputValue);
        onChange?.(inputValue);
      }

      onBlur?.(event);
    },
    [inputValue, submitValue, isOptional, onChange, onBlur, setIsInFocus],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(event.currentTarget.value);
      submitOnBlur.current = true;
    },
    [submitOnBlur],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation(); // don't close modal
        setInputValue(submitValue);
        submitOnBlur.current = false;
        event.currentTarget.blur();
      } else if (event.key === "Enter" && !isMultiline) {
        event.preventDefault();
        submitOnBlur.current = true;
        event.currentTarget.blur();
      }
    },
    [submitValue, isMultiline],
  );

  const handleRootElementClick = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLAnchorElement)) {
      setIsInFocus(true);
    }
  };

  const shouldShowMarkdown = isMarkdown && !isInFocus && inputValue;
  // NOTE: Idea: have the EditableText show a warning when editing a localized
  // value, "You are about to edit the untranslated string. To edit the
  // translated string, contact your administrator."

  // For now, disable editing of localized values
  if (isLocalized) {
    isDisabled = true;
  }

  return (
    <MaybeTranslationCannotBeEditedHoverCard isLocalized={isLocalized}>
      <Box
        component={EditableTextRoot}
        onClick={isMarkdown ? handleRootElementClick : undefined}
        {...props}
        ref={ref}
        isEditing={isEditing}
        isDisabled={isDisabled}
        isEditingMarkdown={!shouldShowMarkdown}
        data-value={`${displayValue}\u00A0`}
        data-testid="editable-text"
        tabIndex={0}
        // For a11y, allow typing to activate the textarea
        onKeyDown={(e: React.KeyboardEvent) => {
          if (shouldPassKeyToTextarea(e.key)) {
            (e.currentTarget as HTMLTextAreaElement).click();
          }
        }}
        onKeyUp={(e: React.KeyboardEvent) => {
          if (!shouldPassKeyToTextarea(e.key)) {
            (e.currentTarget as HTMLTextAreaElement).click();
          }
        }}
        lh={1.57}
      >
        {shouldShowMarkdown ? (
          <Markdown>{displayValue}</Markdown>
        ) : (
          <EditableTextArea
            ref={inputRef}
            value={
              inputRef.current === document.activeElement
                ? inputValue
                : displayValue
            }
            placeholder={placeholder}
            disabled={isDisabled}
            data-testid={dataTestId}
            onFocus={onFocus}
            onBlur={handleBlur}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
        )}
      </Box>
    </MaybeTranslationCannotBeEditedHoverCard>
  );
});

const shouldPassKeyToTextarea = (key: string) => key !== "Enter";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(EditableText, { Root: EditableTextRoot });
