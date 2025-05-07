import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { UploadInput } from "metabase/components/upload";
import ExternalLink from "metabase/core/components/ExternalLink";
import Markdown from "metabase/core/components/Markdown";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { Button, Group, Icon, Stack, Text } from "metabase/ui";
import { useUploadContentTranslationDictionaryMutation } from "metabase-enterprise/api";

export const ContentTranslationConfiguration = () => {
  const [uploadContentTranslationDictionary] =
    useUploadContentTranslationDictionaryMutation();

  // This is used to reset the input so that the same file can be uploaded
  // multiple times
  const [uploadInputReactKey, setUploadInputReactKey] = useState(0);

  const [didUploadRecentlySucceed, setDidUploadRecentlySucceed] =
    useState(false);
  const [didUploadRecentlyFail, setDidUploadRecentlyFail] = useState(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      const file = event.target.files[0];
      await uploadFile(file);
      setUploadInputReactKey((n) => n + 1);
    }
  };

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file) {
        console.error("No file selected");
        return;
      }
      setDidUploadRecentlySucceed(false);
      setDidUploadRecentlyFail(false);
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
        .catch(() => {
          setDidUploadRecentlyFail(true);
          timeoutRef.current = setTimeout(() => {
            setDidUploadRecentlyFail(false);
          }, 5000);
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

  const inputRef = useRef<HTMLInputElement>(null);

  const availableLocalesDocsUrl = useSelector((state) =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- This is used in admin settings
    getDocsUrl(state, {
      page: "configuring-metabase/localization",
      anchor: "supported-languages",
    }),
  );

  return (
    <Stack gap="sm" maw="38rem">
      <Text>
        <Markdown
          components={{
            strong: ({ children }: { children: ReactNode }) => (
              <ExternalLink href={availableLocalesDocsUrl}>
                {children}
              </ExternalLink>
            ),
          }}
        >
          {t`You can upload a translation dictionary. We'll use this to translate user-provided strings (like question names) into the viewer's language. (Built-in strings won't be affected.) Your translation dictionary should be a CSV with three columns: Locale code, String, Translation. Supported locale codes are **listed here**. Uploading a new dictionary will replace the existing translations.`}
        </Markdown>
      </Text>

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
            c={
              didUploadRecentlySucceed || didUploadRecentlyFail
                ? "white"
                : undefined
            }
            bg={
              didUploadRecentlySucceed
                ? "success"
                : didUploadRecentlyFail
                  ? "error"
                  : undefined
            }
          >
            {didUploadRecentlySucceed
              ? t`Dictionary uploaded`
              : didUploadRecentlyFail
                ? t`Could not upload dictionary`
                : t`Upload translation dictionary`}
          </Button>
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
    </Stack>
  );
};
