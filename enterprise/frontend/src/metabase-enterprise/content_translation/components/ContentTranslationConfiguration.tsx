import { type ChangeEvent, useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { useUploadContentTranslationDictionaryMutation } from "metabase/api/content-translation";
import { UploadInput } from "metabase/components/upload";
import { Button, Group, Icon, Stack, Text } from "metabase/ui";

export const ContentTranslationConfiguration = () => {
  const [uploadContentTranslationDictionary] =
    useUploadContentTranslationDictionaryMutation();

  // This is used to reset the input so that the same file can be uploaded
  // multiple times
  const [uploadInputReactKey, setUploadInputReactKey] = useState(0);

  const [didFileUploadRecentlyFail, setDidFileUploadFail] =
    useState<boolean>(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      const file = event.target.files[0];
      try {
        await uploadFile(file);
      } catch (error) {
        setDidFileUploadFail(true);
      }
      setUploadInputReactKey((n) => n + 1);
    }
  };

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file) {
        console.error("No file selected");
        return;
      }
      await uploadContentTranslationDictionary({ file })
        .unwrap()
        .then(() => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          setDidUploadRecentlySucceed(true);
          timeoutRef.current = setTimeout(() => {
            setDidUploadRecentlySucceed(false);
          }, 5000);
        })
        .catch((e) => {
          setErrorMessage(e.data.message);
        });
    },
    [uploadContentTranslationDictionary],
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerUpload = () => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.style.display = "block";
    input.click();
    input.style.display = "none";
  };
  const [didUploadRecentlySucceed, setDidUploadRecentlySucceed] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Stack gap="md" maw="38rem">
      <Group gap="sm">
        <Stack gap="sm">
          <Button
            leftSection={
              didUploadRecentlySucceed ? (
                <Icon name="check" />
              ) : (
                <Icon name="upload" />
              )
            }
            onClick={triggerUpload}
            maw="20rem"
            c={didUploadRecentlySucceed ? "white" : undefined}
            bg={didUploadRecentlySucceed ? "success" : undefined}
          >
            {didUploadRecentlySucceed
              ? t`Dictionary uploaded`
              : t`Upload translation dictionary`}
          </Button>
          {errorMessage && (
            <Text role="alert" c="danger">
              {errorMessage}
            </Text>
          )}
        </Stack>
      </Group>
      <UploadInput
        id="content-translation-dictionary-upload-input"
        style={{ display: "none" }}
        ref={inputRef}
        accept="text/csv"
        onChange={handleFileChange}
        key={uploadInputReactKey}
      />
      {didFileUploadRecentlyFail && (
        <Text role="alert" c="error">
          {t`Error uploading file`}
        </Text>
      )}
    </Stack>
  );
};
