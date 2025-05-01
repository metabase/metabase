import { type ReactNode } from "react";
import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import FormFileInput from "metabase/core/components/FormFileInput";
import Markdown from "metabase/core/components/Markdown";
import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { Icon, Stack, Text } from "metabase/ui";
import { useUploadContentTranslationDictionaryMutation } from "metabase-enterprise/api";
import { UploadInput } from "metabase/components/upload";

interface FormValues {
  file: File | null;
}

export const ContentTranslationConfiguration = () => {
  const [uploadContentTranslationDictionary] =
    useUploadContentTranslationDictionaryMutation();

  const availableLocalesDocsUrl = useSelector((state) =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- This is used in admin settings
    getDocsUrl(state, {
      page: "configuring-metabase/localization",
      anchor: "supported-languages",
    }),
  );

  const handleSubmit = async (values: FormValues) => {
    if (!values.file) {
      throw new Error(t`No file selected`);
    }

    await uploadContentTranslationDictionary({ file: values.file }).unwrap();
  };

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

      <FormProvider initialValues={{ file: null }} onSubmit={handleSubmit}>
        <Form>
          <Stack gap="md">
            <FormSubmitButton
              leftSection={<Icon name="upload" />}
              label={t`Upload translation dictionary`}
              successLabel={t`Dictionary uploaded`}
              failedLabel={t`Could not upload dictionary`}
              onClick={triggerUpload}
              maw="20rem"
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
      </FormProvider>
    </Stack>
  );
};
