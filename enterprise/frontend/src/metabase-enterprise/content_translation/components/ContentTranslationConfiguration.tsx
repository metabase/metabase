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
import {
  Form,
  FormProvider,
  FormSubmitButton,
  useFormContext,
} from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { Group, Icon, Loader, Stack, Text } from "metabase/ui";
import { useUploadContentTranslationDictionaryMutation } from "metabase-enterprise/api";

export const ContentTranslationConfiguration = () => {
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

      <FormProvider
        // We're only using Formik to make the appearance of the submit button
        // depend on the form's status. We're not using Formik's other features
        // here.
        initialValues={{}}
        onSubmit={() => {}}
      >
        <UploadForm />
      </FormProvider>
    </Stack>
  );
};

const UploadForm = () => {
  const [uploadContentTranslationDictionary] =
    useUploadContentTranslationDictionaryMutation();

  // This is used to reset the input so that the same file can be uploaded
  // multiple times
  const [uploadInputReactKey, setUploadInputReactKey] = useState(0);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      const file = event.target.files[0];
      await uploadFile(file);
      setUploadInputReactKey((n) => n + 1);
    }
  };

  const { status, setStatus } = useFormContext();

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file) {
        console.error("No file selected");
        return;
      }
      setStatus("pending");
      await uploadContentTranslationDictionary({ file })
        .unwrap()
        .then(() => {
          setStatus("fulfilled");
        })
        .catch(() => {
          setStatus("rejected");
        });
    },
    [uploadContentTranslationDictionary, setStatus],
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
    <Form>
      <Stack gap="md">
        <FormSubmitButton
          disabled={status === "pending"}
          label={
            <Group gap="sm">
              <Icon name="upload" opacity=".8" />
              <Text c="white">{t`Upload translation dictionary`}</Text>
            </Group>
          }
          successLabel={
            <Group gap="sm" role="alert">
              <Icon name="check" opacity=".8" />
              <Text c="white">{t`Dictionary uploaded`}</Text>
            </Group>
          }
          failedLabel={
            <Group gap="sm" role="alert">
              <Icon name="warning" opacity=".8" />
              <Text c="white">{t`Could not upload dictionary`}</Text>
            </Group>
          }
          activeLabel={
            <Group gap="md" role="alert">
              <Loader size="xs" opacity=".8" />
              <Text>{t`Uploading dictionary…`}</Text>
            </Group>
          }
          maw="20rem"
          variant="filled"
          onClick={(e) => {
            triggerUpload();
            e.preventDefault();
          }}
        />
        <UploadInput
          id="content-translation-dictionary-upload-input"
          style={{ display: "none" }}
          ref={inputRef}
          accept="text/csv"
          onChange={handleFileChange}
          key={uploadInputReactKey}
        />
      </Stack>
    </Form>
  );
};
