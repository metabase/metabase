import cx from "classnames";
import type { Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import type { TextInputProps } from "metabase/ui";
import { ActionIcon, CopyButton, Icon, TextInput, Tooltip } from "metabase/ui";

import S from "./CopyTextInput.module.css";

const defaultProps = {
  readOnly: true,
  value: "copy me",
};

export const CopyTextInput = forwardRef(function CopyTextInput(
  {
    classNames,
    onClick,
    onCopied,
    readOnly,
    ...props
  }: TextInputProps & { value: string; onCopied?: () => void },
  ref: Ref<HTMLInputElement>,
) {
  const isReadOnly = readOnly ?? defaultProps.readOnly;

  return (
    <TextInput
      {...defaultProps}
      {...props}
      ref={ref}
      readOnly={isReadOnly}
      onClick={(e) => {
        if (isReadOnly) {
          e.currentTarget.setSelectionRange(0, e.currentTarget.value.length);
        }
        onClick?.(e);
      }}
      classNames={{
        ...classNames,
        input: cx(S.input, (classNames as Record<string, string>)?.input),
      }}
      rightSectionPointerEvents="all"
      rightSection={
        props.value ? (
          <CopyButton value={props.value} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={t`Copied!`} opened={copied}>
                <ActionIcon
                  variant="subtle"
                  aria-label={t`Copy`}
                  data-testid="copy-button"
                  onClick={() => {
                    copy();
                    onCopied?.();
                  }}
                >
                  <Icon name="copy" />
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        ) : undefined
      }
    />
  );
});
