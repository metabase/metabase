import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useField } from "formik";
import { type Ref, forwardRef } from "react";
import { t } from "ttag";

import {
  Button,
  Stack,
  Text,
  TextInput,
  type TextInputProps,
} from "metabase/ui";

import S from "./FormSecretKey.module.css";
import { SetupKeyModal } from "./SetupKeyModal";

export interface FormSecretKeyProps
  extends Omit<TextInputProps, "value" | "error"> {
  name: string;
  nullable?: boolean;
}

export const FormSecretKey = forwardRef(function FormSecretKey(
  { name, nullable, onChange, onBlur, ...props }: FormSecretKeyProps,
  ref: Ref<HTMLInputElement>,
) {
  const [showModal, { open: openModal, close: closeModal }] = useDisclosure();
  const [{ value }, { error }, { setValue }] = useField(name);

  return (
    <>
      <Stack gap="sm">
        <TextInput
          {...props}
          ref={ref}
          name={name}
          readOnly
          value={obfuscateValue(value)}
          classNames={{
            wrapper: S.inputWrapper,
            input: cx(S.input, {
              [S.unset]: !value, // Just show the 'Set up key' button when no key is set yet
            }),
          }}
          rightSection={
            <Button
              className={S.generateButton}
              miw={value ? undefined : "10rem"}
              onClick={openModal}
              variant="filled"
            >
              {value ? t`Regenerate key` : t`Set up key`}
            </Button>
          }
          rightSectionProps={{ className: S.rightSection }}
        />
        {!!error && <Text c="error">{error}</Text>}
      </Stack>
      {showModal && (
        <SetupKeyModal
          onConfirm={(newValue) => {
            setValue(newValue);
            closeModal();
          }}
          onClose={closeModal}
          currentValue={value}
        />
      )}
    </>
  );
});

const obfuscateValue = (value: string) =>
  value ? "**********" + value.slice(-2) : "";
