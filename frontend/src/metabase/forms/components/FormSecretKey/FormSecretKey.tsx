import { useDisclosure } from "@mantine/hooks";
import { useField } from "formik";
import type { ChangeEvent, FocusEvent, Ref } from "react";
import { forwardRef, useCallback, useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import CS from "metabase/css/core/index.css";
import { UtilApi } from "metabase/services";
import type { PasswordInputProps } from "metabase/ui";
import {
  Alert,
  Button,
  Flex,
  Icon,
  PasswordInput,
  Stack,
  TextInput,
} from "metabase/ui";

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
  const [showCopyAlert, setShowCopyAlert] = useState(false);
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
    setShowCopyAlert(true);
  };

  // When the backend returns an obfuscated value the secret is already set.
  // Show it as a disabled plain-text input (no eye-toggle, no empty placeholder)
  // so the admin can see that something is configured without revealing the key.
  // Once they confirm regeneration the value becomes a fresh plaintext token and
  // the component switches back to a normal PasswordInput.
  const isAlreadySet = isObfuscatedValue(value);

  return (
    <>
      <Stack gap="sm">
        <Flex align="end" gap="1rem">
          {isAlreadySet ? (
            <TextInput
              {...props}
              ref={ref}
              name={name}
              value={value}
              readOnly
              error={touched ? error : null}
            />
          ) : (
            <PasswordInput
              {...props}
              ref={ref}
              name={name}
              value={value ?? ""}
              error={touched ? error : null}
              onChange={handleChange}
              onBlur={handleBlur}
            />
          )}
          <Button
            className={CS.flexNoShrink}
            variant="filled"
            onClick={value ? openModal : generateToken}
          >
            {value ? t`Regenerate key` : t`Generate key`}
          </Button>
        </Flex>
        {showCopyAlert && (
          <Alert icon={<Icon name="info" />}>
            {t`Copy and store this key in a safe place. You won’t be able to view it again after saving these settings.`}
          </Alert>
        )}
      </Stack>
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
