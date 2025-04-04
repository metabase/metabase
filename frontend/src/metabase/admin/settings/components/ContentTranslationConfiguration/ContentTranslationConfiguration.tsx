import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";
import _ from "underscore";

import { getLocales } from "metabase/account/profile/selectors";
import { useUploadContentTranslationDictionaryMutation } from "metabase/api/content-translation";
import { useLocale } from "metabase/common/hooks";
import { UploadInput } from "metabase/components/upload";
import { openSaveDialog } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import {
  Button,
  type ComboboxItem,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
} from "metabase/ui";

import { LocaleCheckboxes } from "./LocaleCheckboxes";

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
      await uploadContentTranslationDictionary({ file });

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setDidUploadRecentlySucceed(true);
      timeoutRef.current = setTimeout(() => {
        setDidUploadRecentlySucceed(false);
      }, 5000);
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

  const inputRef = useRef<HTMLInputElement>(null);

  const [selectedLocales, setSelectedLocales] = useState<string[]>([]);
  const availableLocalesAsTuples = useSelector(getLocales);

  const triggerDownload = async () => {
    const localesString = selectedLocales.toSorted().join(",");
    const response = await fetch("/api/dictionary/csv", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ locales: localesString }),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const blob = await response.blob();
    const filename =
      _.compact(["content-dictionary", localesString]).join("-") + ".csv";
    openSaveDialog(filename, blob);
  };

  const uiLocale = useLocale();

  const availableLocales: ComboboxItem[] = useMemo(
    () =>
      availableLocalesAsTuples
        ?.map(([value, label]) => ({
          value,
          label,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, uiLocale)) || [],
    [availableLocalesAsTuples, uiLocale],
  );

  const [isDownloadModalShown, setIsDownloadModalShown] = useState(false);

  if (!availableLocales?.length) {
    throw new Error("No locales found");
  }

  return (
    <Stack gap="md">
      <Text
        lh={1.25}
      >{t`Download a CSV with three columns: Language, String, Translation. Add translations to the CSV (as many as you like), then re-upload it here.`}</Text>
      <Group gap="sm">
        <Button
          onClick={() => setIsDownloadModalShown(true)}
          leftSection={<Icon name="download" />}
          maw="20rem"
        >
          {t`Download translation dictionary...`}
        </Button>
        {isDownloadModalShown && (
          <DownloadDictionaryModal
            setSelectedLocales={setSelectedLocales}
            selectedLocales={selectedLocales}
            availableLocales={availableLocales}
            triggerDownload={triggerDownload}
            setIsDownloadModalShown={setIsDownloadModalShown}
          />
        )}
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

const DownloadDictionaryModal = ({
  setSelectedLocales,
  selectedLocales,
  availableLocales,
  triggerDownload,
  setIsDownloadModalShown,
}: {
  setSelectedLocales: Dispatch<SetStateAction<string[]>>;
  selectedLocales: string[];
  availableLocales: ComboboxItem[];
  triggerDownload: () => void;
  setIsDownloadModalShown: Dispatch<SetStateAction<boolean>>;
}) => {
  return (
    <Modal
      title={t`Download translation dictionary`}
      opened
      onClose={() => setIsDownloadModalShown(false)}
      size="xl"
    >
      <Stack pt="md" gap="lg" h="32rem" pos="relative">
        <Stack gap="xs">
          <Text>{t`Create dictionary entries for these languages:`}</Text>
          <LocaleCheckboxes
            setSelectedLocales={setSelectedLocales}
            selectedLocales={selectedLocales}
            availableLocales={availableLocales}
            style={{ overflowY: "auto" }}
            p="md"
            h="25rem"
            bd="1px solid var(--mb-color-border)"
          />
        </Stack>
        <Button
          onClick={triggerDownload}
          leftSection={<Icon name="download" />}
          maw="15rem"
          bottom={0}
        >{t`Download`}</Button>
      </Stack>
    </Modal>
  );
};
