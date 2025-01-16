import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { getLocales } from "metabase/account/profile/selectors";
import { useUploadContentTranslationDictionaryMutation } from "metabase/api/content-translation";
import { useLocale } from "metabase/common/hooks";
import { UploadInput } from "metabase/components/upload";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { useSelector } from "metabase/lib/redux";
import {
  Button,
  Group,
  Icon,
  Modal,
  MultiAutocomplete,
  Stack,
  Text,
} from "metabase/ui";

export const ContentTranslationConfiguration = () => {
  const [uploadContentTranslationDictionary] =
    useUploadContentTranslationDictionaryMutation();
  const [uploadInputReactKey, setUploadInputReactKey] = useState(0);
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      const file = event.target.files[0];
      await uploadFile(file);
      setUploadInputReactKey(n => n + 1);
    }
  };

  const uploadFile = async (file: File) => {
    if (!file) {
      console.error("No file selected");
      return;
    }
    try {
      await uploadContentTranslationDictionary({ file });

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setDidUploadRecentlySucceed(true);
      timeoutRef.current = setTimeout(() => {
        setDidUploadRecentlySucceed(false);
      }, 5000);
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  };
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerDownload = () => {
    window.location.href = `/api/dictionary/csv/${selectedLocales.join("-")}`;
  };

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

  const uiLocale = useLocale();

  const availableLocales = useMemo(() => {
    return availableLocalesAsTuples
      ?.map(([value, label]) => ({
        value,
        label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, uiLocale));
  }, [availableLocalesAsTuples, uiLocale]);

  const [isDownloadModalShown, setIsDownloadModalShown] = useState(false);

  if (!availableLocales?.length) {
    throw new Error("No locales found");
  }

  return (
    <Stack spacing="md">
      <Text
        lh={1.25}
      >{t`Download a CSV with three columns: Language, String, Translation. Add translations, then upload the file here.`}</Text>
      <Group spacing="sm">
        <Button
          onClick={() => setIsDownloadModalShown(true)}
          leftIcon={<Icon name="download" />}
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
          leftIcon={
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
        style={{ display: "none" }}
        ref={inputRef}
        accept="text/csv"
        onChange={handleFileChange}
        // This is used to reset the input so that the same file can be uploaded multiple times
        key={uploadInputReactKey}
      />
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
  availableLocales: { value: string; label: string }[];
  triggerDownload: () => void;
  setIsDownloadModalShown: Dispatch<SetStateAction<boolean>>;
}) => {
  const languageInputId = useUniqueId();
  return (
    <Modal
      title={t`Download translation dictionary`}
      opened
      onClose={() => setIsDownloadModalShown(false)}
      size="lg"
    >
      <Stack pt="md" spacing="lg">
        <Stack spacing="xs">
          <label htmlFor={languageInputId}>
            <Text>{t`Create dictionary entries for these languages:`}</Text>
          </label>
          <MultiAutocomplete
            id={languageInputId}
            onChange={(values: string[]) =>
              setSelectedLocales(values.map(value => value.toString()))
            }
            value={selectedLocales}
            data={availableLocales}
            dropdownPosition="top"
          />
        </Stack>
        <Button
          onClick={triggerDownload}
          leftIcon={<Icon name="download" />}
          maw="15rem"
        >{t`Download`}</Button>
      </Stack>
    </Modal>
  );
};
