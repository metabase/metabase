import { useDisclosure } from "@mantine/hooks";
import { useField } from "formik";
import { type Ref, forwardRef } from "react";
import { t } from "ttag";
import { pick } from "underscore";

import CS from "metabase/css/core/index.css";
import {
  Button,
  Flex,
  type PasswordInputProps,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

import { SetupKeyModal } from "./SetupKeyModal";

export interface FormSecretKeyProps
  extends Omit<PasswordInputProps, "value" | "error"> {
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
      <Stack gap="sm" align="flex-start">
        <Flex align="end" gap="1rem">
          <TextInput
            {...pick(props, ["label", "description", "withAsterisk"])}
            ref={ref}
            name={name}
            readOnly
            value={obfuscateValue(value)}
            styles={{
              wrapper: value ? undefined : { display: "none" }, // Display only 'Set up key' button initially
            }}
          />
          <Button
            className={CS.flexNoShrink}
            miw={value ? undefined : "10rem"}
            onClick={openModal}
            variant="filled"
          >
            {value ? t`Regenerate key` : t`Set up key`}
          </Button>
        </Flex>
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
