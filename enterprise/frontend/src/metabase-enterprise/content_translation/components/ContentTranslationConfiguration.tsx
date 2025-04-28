import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { c, msgid, t } from "ttag";

import {
  useListContentTranslationsQuery,
  useUploadContentTranslationDictionaryMutation,
} from "metabase/api/content-translation";
import { UploadInput } from "metabase/components/upload";
import ExternalLink from "metabase/core/components/ExternalLink";
import Markdown from "metabase/core/components/Markdown";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getAvailableLocales } from "metabase/setup/selectors";
import { Button, Group, Icon, List, Stack, Text } from "metabase/ui";

export const ContentTranslationConfiguration = () => {
  const [uploadContentTranslationDictionary] =
    useUploadContentTranslationDictionaryMutation();
  const { data } = useListContentTranslationsQuery();

  const localeToTranslationCount = useMemo(
    () =>
      data?.data.reduce(
        (acc, { locale }) => {
          acc[locale] ??= 0;
          acc[locale]++;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [data],
  );

  // This is used to reset the input so that the same file can be uploaded
  // multiple times
  const [uploadInputReactKey, setUploadInputReactKey] = useState(0);

  const [didUploadRecentlySucceed, setDidUploadRecentlySucceed] =
    useState(false);
  const [didUploadRecentlyFail, setDidUploadRecentlyFail] = useState(false);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

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
      setErrorMessages([]);
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
          setErrorMessages(e.data.errors ?? [t`Unknown error encountered`]);
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

  const locales = useSelector(getAvailableLocales);

  const localeToTranslationCountArray = useMemo(
    () =>
      Object.entries(localeToTranslationCount || {})
        .map(([localeCode, count]) => {
          const localeName =
            locales.find(
              (loc) => loc[0].replace(/_/g, "-") === localeCode,
            )?.[1] || localeCode;
          return [localeName, count] as const;
        })
        .toSorted((a, b) => a[0].localeCompare(b[0])),
    [locales, localeToTranslationCount],
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
          {t`You can upload a translation dictionary. We'll use this to translate user-provided strings (like question names) into the viewer's language. Your translation dictionary should be a CSV with three columns: Locale code, String, Translation. Supported locale codes are **listed here**.  It won't affect built-in strings. Uploading a new dictionary will replace the existing dictionary.`}
        </Markdown>
      </Text>
      {!!localeToTranslationCountArray.length && (
        <Text>
          {t`Currently stored:`}
          <List withPadding>
            {localeToTranslationCountArray.map(([localeCode, count]) => {
              const localeName =
                locales.find((loc) => loc[0] === localeCode)?.[1] || localeCode;
              return (
                <List.Item key={localeCode}>
                  {c(
                    "This string describes how many translations there are of a given string for a particular locale. {0} is the name of a locale. {1} is an integer",
                  ).ngettext(
                    msgid`${localeName}: ${count} translation`,
                    `${localeName}: ${count} translations`,
                    count,
                  )}
                </List.Item>
              );
            })}
          </List>
        </Text>
      )}

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
          {!!errorMessages.length && (
            <Stack gap="xs">
              <Text role="alert" c="error">
                {errorMessages.length === 1
                  ? t`We couldn't upload the file due to this error:`
                  : t`We couldn't upload the file due to these errors:`}
              </Text>
              <List withPadding>
                {errorMessages.map((errorMessage) => (
                  <List.Item key={errorMessage} role="alert" c="danger">
                    {errorMessage}
                  </List.Item>
                ))}
              </List>
            </Stack>
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
    </Stack>
  );
};
