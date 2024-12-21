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
import type { AnySchema } from "yup";

import Markdown from "metabase/core/components/Markdown";
import { Box, Stack, Text } from "metabase/ui";

import { EditableTextArea, EditableTextRoot } from "./EditableText.styled";

export type EditableTextAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "onFocus" | "onBlur"
>;

export interface EditableTextProps extends EditableTextAttributes {
  initialValue?: string | null;
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
  validationSchema?: AnySchema;
}

const EditableText = forwardRef(function EditableText(
  {
    initialValue,
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
    validationSchema,
    ...props
  }: EditableTextProps,
  ref: Ref<HTMLDivElement>,
) {
  const [inputValue, setInputValue] = useState(initialValue ?? "");
  const [submitValue, setSubmitValue] = useState(initialValue ?? "");
  const [isInFocus, setIsInFocus] = useState(isEditing);
  const [validationError, setValidationError] = useState<string | null>(null);
  const displayValue = inputValue ? inputValue : placeholder;
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
      setValidationError(null);
      if (!isOptional && !inputValue) {
        setInputValue(submitValue);
      } else if (inputValue !== submitValue && submitOnBlur.current) {
        if (validationSchema) {
          validationSchema
            .validate(inputValue)
            .then(() => {
              setValidationError(null);
              setSubmitValue(inputValue);
              onChange?.(inputValue);
            })
            .catch(error => {
              setValidationError(error.message);
            });
        } else {
          setSubmitValue(inputValue);
          onChange?.(inputValue);
        }
      }

      onBlur?.(event);
    },
    [
      inputValue,
      submitValue,
      isOptional,
      onChange,
      onBlur,
      setIsInFocus,
      validationSchema,
    ],
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

  return (
    <Stack spacing="0">
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
        error={!!validationError}
      >
        {shouldShowMarkdown ? (
          <Markdown>{inputValue}</Markdown>
        ) : (
          <EditableTextArea
            ref={inputRef}
            value={inputValue}
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
      {!!validationError && (
        <Text color="error" size="xs" mt="xs">
          {validationError}
        </Text>
      )}
    </Stack>
  );
});

const shouldPassKeyToTextarea = (key: string) => key !== "Enter";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(EditableText, { Root: EditableTextRoot });
