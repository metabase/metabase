import { useDisclosure } from "@mantine/hooks";
import { useField } from "formik";
import type { ChangeEvent, FocusEvent, Ref } from "react";
import { forwardRef, useCallback } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import CS from "metabase/css/core/index.css";
import { UtilApi } from "metabase/services";
import type { TextInputProps } from "metabase/ui";
import { Button, Flex, TextInput } from "metabase/ui";

export interface FormSecretKeyProps
  extends Omit<TextInputProps, "value" | "error"> {
  name: string;
  nullable?: boolean;
  confirmation: {
    header: string;
    dialog: string;
  };
}

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
    const result = (await UtilApi.random_token()) as { token: string };
    setValue(result.token);
  };

  return (
    <>
      <Flex align="end" gap="1rem">
        <TextInput
          {...props}
          ref={ref}
          name={name}
          value={value ?? ""}
          error={touched ? error : null}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {value ? (
          <Button
            variant="filled"
            onClick={openModal}
            className={CS.flexNoShrink}
          >{t`Regenerate key`}</Button>
        ) : (
          <Button
            className={CS.flexNoShrink}
            variant="filled"
            onClick={generateToken}
          >{t`Generate key`}</Button>
        )}
      </Flex>
      <ConfirmModal
        opened={modalOpened}
        title={t`Regenerate JWT signing key?`}
        content={t`This will cause existing tokens to stop working until the identity provider is updated with the new key.`}
        onConfirm={() => {
          generateToken();
          closeModal();
        }}
        onClose={closeModal}
      />
    </>
  );
});
