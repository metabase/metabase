import {
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react";
import { c, t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { useDocsUrl } from "metabase/common/hooks";
import { UploadInput } from "metabase/components/upload";
import ExternalLink from "metabase/core/components/ExternalLink";
import Markdown from "metabase/core/components/Markdown";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  useFormContext,
} from "metabase/forms";
import { openSaveDialog } from "metabase/lib/dom";
import { Button, Group, Icon, List, Loader, Stack, Text } from "metabase/ui";
import { useUploadContentTranslationDictionaryMutation } from "metabase-enterprise/api";

/** Maximum file size for uploaded content-translation dictionaries, expressed
 * in mebibytes. */
const maxContentDictionarySizeInMiB = 1.5;

/** The maximum file size is 1.5 mebibytes (which equals 1.57 metabytes).
 * For simplicity, though, let's express this as 1.5 megabytes, which is
 * approximately right. */
const approxMaxContentDictionarySizeInMB = 1.5;

/** This should equal the max-content-translation-dictionary-size variable in the backend */
const maxContentDictionarySizeInBytes =
  maxContentDictionarySizeInMiB * 1024 * 1024;

export const ContentTranslationConfiguration = () => {
  // eslint-disable-next-line no-unconditional-metabase-links-render -- This is used in admin settings
  const availableLocalesDocsUrl = useDocsUrl(
    "configuring-metabase/localization",
    { anchor: "supported-languages" },
  ).url;
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<
    string | null
  >();

  const triggerDownload = async () => {
    const response = await fetch("/api/ee/content-translation/csv", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      setDownloadErrorMessage(t`Couldn't download this file`);
    }

    const blob = await response.blob();
    const filename = "metabase-content-translation-dictionary.csv";
    openSaveDialog(filename, blob);
  };

  const [errorMessages, setErrorMessages] = useState<string[]>([]);

  return (
    <Stack
      gap="sm"
      maw="38rem"
      aria-labelledby="content-translation-header"
      data-testid="content-translation-configuration"
    >
      <SettingHeader
        id="content-translation-header"
        title={t`Content translation`}
        description={
          <Markdown
            components={{
              strong: ({ children }: { children: ReactNode }) => (
                <ExternalLink href={availableLocalesDocsUrl}>
                  {children}
                </ExternalLink>
              ),
            }}
          >
            {t`You can upload a translation dictionary. We'll use this to translate user-provided strings (like question names) into the viewer's language. (Built-in strings won't be affected.) Your translation dictionary should be a CSV with three columns: Locale code, String, Translation. Supported locale codes are **listed here**. Uploading a new dictionary will replace the existing translations. Don't translate sensitive data, since the dictionary will be accessible to all users as well as viewers of public links.`}
          </Markdown>
        }
      />
      <Group>
        <Button
          onClick={triggerDownload}
          leftSection={<Icon name="download" />}
          maw="20rem"
        >
          {t`Download translation dictionary`}
        </Button>
        <FormProvider
          // We're only using Formik to make the appearance of the submit button
          // depend on the form's status. We're not using Formik's other features
          // here.
          initialValues={{}}
          onSubmit={() => {}}
        >
          <UploadForm setErrorMessages={setErrorMessages} />
        </FormProvider>
      </Group>
      {downloadErrorMessage && (
        <Text role="alert" c="danger">
          {downloadErrorMessage}
        </Text>
      )}
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
  );
};

const UploadForm = ({
  setErrorMessages,
}: {
  setErrorMessages: Dispatch<SetStateAction<string[]>>;
}) => {
  const [uploadContentTranslationDictionary] =
    useUploadContentTranslationDictionaryMutation();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      const file = event.target.files[0];

      if (file.size > maxContentDictionarySizeInBytes) {
        setErrorMessages([
          c("{0} is a number")
            .t`Upload a dictionary smaller than ${approxMaxContentDictionarySizeInMB} MB`,
        ]);
        setStatus("rejected");
        return;
      }

      await uploadFile(file);
      resetInput();
    }
  };

  const resetInput = () => {
    const input = inputRef.current;
    if (input) {
      input.value = "";
    }
  };

  const { status, setStatus } = useFormContext();

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file) {
        console.error("No file selected");
        return;
      }
      setErrorMessages([]);
      setStatus("pending");
      await uploadContentTranslationDictionary({ file })
        .unwrap()
        .then(() => {
          setStatus("fulfilled");
        })
        .catch((e) => {
          setErrorMessages(e.data.errors ?? [t`Unknown error encountered`]);
          setStatus("rejected");
        });
    },
    [uploadContentTranslationDictionary, setErrorMessages, setStatus],
  );

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

  return (
    <Form data-testid="content-localization-setting">
      <Stack gap="md">
        <FormSubmitButton
          disabled={status === "pending"}
          label={
            <Group gap="sm">
              <Icon name="upload" opacity=".8" />
              <Text c="inherit">{t`Upload translation dictionary`}</Text>
            </Group>
          }
          successLabel={
            <Group gap="sm" role="alert">
              <Icon name="check" opacity=".8" />
              <Text c="inherit">{t`Dictionary uploaded`}</Text>
            </Group>
          }
          failedLabel={
            <Group gap="sm" role="alert">
              <Icon name="warning" opacity=".8" />
              <Text c="inherit">{t`Could not upload dictionary`}</Text>
            </Group>
          }
          activeLabel={
            <Group gap="md" role="alert">
              <Loader size="xs" opacity=".8" />
              <Text c="inherit">{t`Uploading dictionary…`}</Text>
            </Group>
          }
          maw="20rem"
          onClick={(e) => {
            triggerUpload();
            e.preventDefault();
          }}
        />
        <UploadInput
          id="content-translation-dictionary-upload-input"
          ref={inputRef}
          accept="text/csv"
          onChange={handleFileChange}
        />
      </Stack>
    </Form>
  );
};
