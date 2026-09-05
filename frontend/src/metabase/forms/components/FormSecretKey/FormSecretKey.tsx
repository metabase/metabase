import cx from "classnames";
import { useField } from "formik";
import { type Ref, forwardRef, useState } from "react";
import { t } from "ttag";

import {
  Button,
  Stack,
  Text,
  TextInput,
  type TextInputProps,
} from "metabase/ui";

import S from "./FormSecretKey.module.css";
import { RegenerateKeyConfirmModal } from "./RegenerateKeyConfirmModal";
import { SecretKeyModal } from "./SetupKeyModal";

export interface FormSecretKeyProps extends Omit<
  TextInputProps,
  "value" | "error"
> {
  name: string;
  nullable?: boolean;
}

type OpenModal = "create-key" | "confirm-regenerate" | "store-new-key" | null;

export const FormSecretKey = forwardRef(function FormSecretKey(
  { name, nullable, onChange, onBlur, readOnly, ...props }: FormSecretKeyProps,
  ref: Ref<HTMLInputElement>,
) {
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  const [{ value }, { error }, { setValue }] = useField(name);

  const closeModal = () => setOpenModal(null);

  const confirmSecretKey = (secretKey: string) => {
    setValue(secretKey);
    closeModal();
  };

  const hasSecretKey = Boolean(value);

  const generateSecretButtonProps = readOnly
    ? null
    : {
        rightSection: (
          <Button
            className={S.generateButton}
            miw={hasSecretKey ? undefined : "10rem"}
            onClick={() =>
              setOpenModal(hasSecretKey ? "confirm-regenerate" : "create-key")
            }
            variant={hasSecretKey ? "default" : "filled"}
          >
            {hasSecretKey ? t`Regenerate key` : t`Set up key`}
          </Button>
        ),
        rightSectionProps: { className: S.rightSection },
      };

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
              [S.unset]: !hasSecretKey, // Just show the 'Set up key' button when no key is set yet
            }),
          }}
          {...generateSecretButtonProps}
        />
        {!!error && <Text c="feedback-negative">{error}</Text>}
      </Stack>

      {openModal === "create-key" && (
        <SecretKeyModal
          title={t`Create a secret key`}
          confirmLabel={t`Create`}
          withCancelButton
          onConfirm={confirmSecretKey}
          onClose={closeModal}
        />
      )}

      {openModal === "confirm-regenerate" && (
        <RegenerateKeyConfirmModal
          onConfirm={() => setOpenModal("store-new-key")}
          onClose={closeModal}
        />
      )}

      {openModal === "store-new-key" && (
        <SecretKeyModal
          title={t`Store your new key`}
          confirmLabel={t`Done`}
          onConfirm={confirmSecretKey}
          onClose={closeModal}
        />
      )}
    </>
  );
});

const obfuscateValue = (value: string) =>
  value ? "**********" + value.slice(-2) : "";
