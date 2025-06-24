import {
  type ChangeEvent,
  type Dispatch,
  type PropsWithChildren,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { c, msgid, ngettext, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import ExternalLink from "metabase/common/components/ExternalLink";
import Markdown from "metabase/common/components/Markdown";
import { UploadInput } from "metabase/common/components/upload";
import { useConfirmation, useDocsUrl, useToast } from "metabase/common/hooks";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  useFormContext,
} from "metabase/forms";
import { openSaveDialog } from "metabase/lib/dom";
import {
  Button,
  Group,
  Icon,
  List,
  Loader,
  Stack,
  Text,
  type TextProps,
} from "metabase/ui";
import { useUploadContentTranslationDictionaryMutation } from "metabase-enterprise/api";

import { contentTranslationEndpoints } from "../../constants";

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
  const [isDownloadInProgress, setIsDownloadInProgress] = useState(false);
  const [uploadErrorMessages, setUploadErrorMessages] = useState<string[]>([]);
  const [showDownloadingIndicator, setShowDownloadingIndicator] =
    useState(false);

  const showDownloadError = useCallback((errorMessage: string) => {
    setDownloadErrorMessage(errorMessage);
    setIsDownloadInProgress(false);
  }, []);

  const [sendToast] = useToast();

  const triggerDownload = async () => {
    setDownloadErrorMessage(null);
    setIsDownloadInProgress(true);
    try {
      const response = await fetch(contentTranslationEndpoints.getCSV, {
        method: "GET",
      });

      if (!response.ok) {
        showDownloadError(t`Couldn't download this file`);
        return;
      }

      const blob = await response.blob();
      const filename = "metabase-content-translations.csv";
      openSaveDialog(filename, blob);
      setIsDownloadInProgress(false);
      await sendToast({ message: t`Dictionary downloaded`, icon: "download" });
    } catch {
      showDownloadError(t`An error occurred`);
    }
  };

  useEffect(
    function delayDownloadIndicator() {
      // To avoid jankiness, only show the download indicator once the download
      // has been in progress for longer than this many milliseconds
      const DELAY = 250;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      if (isDownloadInProgress) {
        timeout = setTimeout(() => setShowDownloadingIndicator(true), DELAY);
      } else {
        setShowDownloadingIndicator(false);
        timeout && clearTimeout(timeout);
      }
      return () => {
        timeout && clearTimeout(timeout);
      };
    },
    [isDownloadInProgress],
  );

  return (
    <SettingsSection title={t`Localizing user-generated content`}>
      <Stack
        gap="sm"
        maw="38rem"
        aria-labelledby="content-translation-header"
        data-testid="content-translation-configuration"
      >
        <SettingHeader
          id="content-translation-header"
          description={
            <>
              <Stack gap="sm">
                <DescriptionText>{t`You can upload a translation dictionary to handle user-generated strings, like dashboard names.`}</DescriptionText>
                <DescriptionText>{t`The dictionary must be a CSV with these columns:`}</DescriptionText>
                <List ms="sm" c="text-medium">
                  <List.Item c="inherit">{t`Locale Code`}</List.Item>
                  <List.Item c="inherit">{t`String`}</List.Item>
                  <List.Item c="inherit">{t`Translation`}</List.Item>
                </List>
                <DescriptionText>{t`Don't put any sensitive data in the dictionary, since anyone can see the dictionary—including viewers of public links.`}</DescriptionText>
                <DescriptionText>{t`Uploading a new dictionary will replace the existing dictionary.`}</DescriptionText>
                <Markdown
                  components={{
                    em: ({ children }: { children: ReactNode }) => (
                      <ExternalLink href={availableLocalesDocsUrl}>
                        {children}
                      </ExternalLink>
                    ),
                  }}
                >
                  {t`See a list of *supported locales*.`}
                </Markdown>
              </Stack>
            </>
          }
        />
        <Group>
          <Button
            onClick={triggerDownload}
            leftSection={
              showDownloadingIndicator ? null : (
                <Icon name="download" c="brand" />
              )
            }
            miw="calc(50% - 0.5rem)"
            style={{ flexGrow: 1 }}
            disabled={isDownloadInProgress}
          >
            {showDownloadingIndicator ? (
              <Loader size="sm" />
            ) : (
              t`Download translation dictionary`
            )}
          </Button>
          <FormProvider
            // We're only using Formik to make the appearance of the submit button
            // depend on the form's status. We're not using Formik's other features
            // here.
            initialValues={{}}
            onSubmit={() => {}}
          >
            <UploadForm setErrorMessages={setUploadErrorMessages} />
          </FormProvider>
        </Group>
        {downloadErrorMessage && (
          <Text role="alert" c="danger">
            {downloadErrorMessage}
          </Text>
        )}
        {!!uploadErrorMessages.length && (
          <Stack gap="xs">
            <Text role="alert" c="error">
              {ngettext(
                msgid`We couldn't upload the file due to this error:`,
                `We couldn't upload the file due to these errors:`,
                uploadErrorMessages.length,
              )}
            </Text>
            <List withPadding>
              {uploadErrorMessages.map((errorMessage) => (
                <List.Item key={errorMessage} role="alert" c="danger">
                  {errorMessage}
                </List.Item>
              ))}
            </List>
          </Stack>
        )}
      </Stack>
    </SettingsSection>
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
        setStatus("rejected");
        updateUploadErrorMessages([
          c("{0} is a number")
            .t`The file is larger than ${approxMaxContentDictionarySizeInMB} MB`,
        ]);
        resetInput();
        return;
      }

      await uploadFile(file);
      resetInput();
    }
  };

  const proceedWithUploadAfterConfirmation = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    askConfirmation({
      title: t`Upload new dictionary?`,
      message: t`This will replace the existing dictionary.`,
      confirmButtonText: t`Replace existing dictionary`,
      onConfirm: () => {
        handleFileChange(event);
      },
      onCancel: () => {
        // Reset the input so that choosing the same file again triggers the
        // input's onChange handler
        resetInput();
      },
    });
  };

  const resetInput = () => {
    const input = inputRef.current;
    if (input) {
      input.value = "";
    }
  };

  const { status, setStatus } = useFormContext();

  const [sendToast] = useToast();

  const updateUploadErrorMessages = useCallback(
    (errorMessages: string[]) => {
      setErrorMessages(errorMessages);
      if (errorMessages.length) {
        return sendToast({
          message: t`Could not upload dictionary`,
          icon: "warning",
        });
      }
    },
    [setErrorMessages, sendToast],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file) {
        console.error("No file selected");
        return;
      }
      updateUploadErrorMessages([]);
      setStatus("pending");
      await uploadContentTranslationDictionary({ file })
        .unwrap()
        .then(async () => {
          setStatus("fulfilled");
          await sendToast({ message: t`Dictionary uploaded` });
        })
        .catch(async (e) => {
          await updateUploadErrorMessages(
            e.data?.errors ?? [t`Unknown error encountered`],
          );
          setStatus("rejected");
        });
    },
    [
      uploadContentTranslationDictionary,
      updateUploadErrorMessages,
      setStatus,
      sendToast,
    ],
  );

  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();

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
    <Form
      data-testid="content-localization-setting"
      flex="1 1 0"
      miw="calc(50% - 1rem)"
      display="flex"
    >
      {confirmationModal}
      <FormSubmitButton
        flex="1 1 0"
        w="auto"
        disabled={status === "pending"}
        label={
          <Group gap="sm">
            <Icon name="upload" c="brand" />
            <Text c="inherit">{t`Upload translation dictionary`}</Text>
          </Group>
        }
        successLabel={
          <Group gap="sm" role="alert">
            <Icon name="check" c="success" />
            <Text c="inherit">{t`Dictionary uploaded`}</Text>
          </Group>
        }
        failedLabel={
          <Group gap="sm" role="alert">
            <Icon name="warning" c="danger" />
            <Text c="inherit">{t`Could not upload dictionary`}</Text>
          </Group>
        }
        activeLabel={
          <Group gap="md" role="alert">
            <Loader size="xs" opacity=".8" />
            <Text c="inherit">{t`Uploading dictionary…`}</Text>
          </Group>
        }
        onClick={(e) => {
          triggerUpload();
          e.preventDefault();
        }}
      />
      <UploadInput
        id="content-translation-dictionary-upload-input"
        ref={inputRef}
        accept="text/csv"
        onChange={proceedWithUploadAfterConfirmation}
      />
    </Form>
  );
};
const DescriptionText = (props: PropsWithChildren<TextProps>) => (
  <Text c="inherit" lh="1.5" {...props} />
);
