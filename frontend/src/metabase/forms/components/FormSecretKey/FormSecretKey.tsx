import { useDisclosure } from "@mantine/hooks";
import { useField } from "formik";
import type { ChangeEvent, FocusEvent, Ref } from "react";
import { forwardRef, useCallback } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import CS from "metabase/css/core/index.css";
import { UtilApi } from "metabase/services";
import type { PasswordInputProps } from "metabase/ui";
import { Button, Flex, PasswordInput } from "metabase/ui";

export interface FormSecretKeyProps
  extends Omit<PasswordInputProps, "value" | "error"> {
  name: string;
  nullable?: boolean;
  confirmation: {
    header: string;
    dialog: string;
  };
}

/** Matches the obfuscated format produced by the backend for sensitive settings:
 *  10 asterisks followed by the last 2 characters of the original value. */
const OBFUSCATED_VALUE_PATTERN = /^\*{10}.{2}$/;

const isObfuscatedValue = (value: unknown): boolean =>
  typeof value === "string" && OBFUSCATED_VALUE_PATTERN.test(value);

export const FormSecretKey = forwardRef(function FormSecretKey(
  {
    name,
    nullable,
    confirmation,
    onChange,
    onBlur,
    ...props
  }: FormSecretKeyProps,
  ref: Ref<HTMLInputElement>,
) {
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure();
  const [{ value }, { error, touched }, { setValue, setTouched }] =
    useField(name);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      if (newValue === "") {
        setValue(nullable ? null : undefined);
      } else {
        setValue(newValue);
      }
      onChange?.(event);
    },
    [nullable, setValue, onChange],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setTouched(true);
      onBlur?.(event);
    },
    [setTouched, onBlur],
  );

  const generateToken = async () => {
    const result = await UtilApi.random_token();
    setValue(result.token);
  };

  // When the backend returns an obfuscated value, the secret is already set but
  // unreadable. Show the "Regenerate key" button without displaying the masked
  // string — the input stays empty to signal write-only behaviour.
  const isAlreadySet = isObfuscatedValue(value);
  const displayValue = isAlreadySet ? "" : (value ?? "");

  return (
    <>
      <Flex align="end" gap="1rem">
        <PasswordInput
          {...props}
          ref={ref}
          name={name}
          value={displayValue}
          placeholder={isAlreadySet ? t`Already set` : props.placeholder}
          error={touched ? error : null}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {value && !isAlreadySet ? (
          <Button
            variant="filled"
            onClick={openModal}
            className={CS.flexNoShrink}
          >{t`Regenerate key`}</Button>
        ) : (
          <Button
            className={CS.flexNoShrink}
            variant="filled"
            onClick={isAlreadySet ? openModal : generateToken}
          >
            {isAlreadySet ? t`Regenerate key` : t`Generate key`}
          </Button>
        )}
      </Flex>
      <ConfirmModal
        opened={modalOpened}
        title={confirmation.header}
        content={confirmation.dialog}
        onConfirm={() => {
          generateToken();
          closeModal();
        }}
        onClose={closeModal}
      />
    </>
  );
});
