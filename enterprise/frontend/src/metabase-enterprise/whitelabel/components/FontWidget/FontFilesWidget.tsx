import type { FocusEvent } from "react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/settings";
import { Box, Flex, Stack, Text, TextInput } from "metabase/ui";

import S from "./FontFilesWidget.module.css";
import type { FontFileOption } from "./types";
import { getFontFiles, getFontOptions, getFontUrls } from "./utils";

export const FontFilesWidget = () => {
  const {
    value: files,
    updateSetting,
    description: fontFilesDescription,
  } = useAdminSetting("application-font-files");

  const urls = useMemo(() => getFontUrls(files ?? []), [files]);

  const handleChange = useCallback(
    async (option: FontFileOption, url: string) => {
      if (
        urls[option.fontWeight] === url ||
        (!urls[option.fontWeight] && !url)
      ) {
        return;
      }

      await updateSetting({
        key: "application-font-files",
        value: getFontFiles({ ...urls, [option.fontWeight]: url }),
      });
    },
    [urls, updateSetting],
  );

  return (
    <Stack mt="lg" gap="sm">
      <Text c="text-secondary">{fontFilesDescription}</Text>
      <FontFilesTable urls={urls} onChange={handleChange} />
    </Stack>
  );
};

interface FontFilesTableProps {
  urls: Record<string, string>;
  onChange: (option: FontFileOption, url: string) => void;
}

const FontFilesTable = ({
  urls,
  onChange,
}: FontFilesTableProps): JSX.Element => {
  return (
    <Box data-testid="font-files-widget">
      <Flex
        className={S.headerBorder}
        align="center"
        bg="background_page-secondary"
        c="text-secondary"
        fz="xs"
        fw="bold"
        lh="xs"
        lts="0.0625rem"
        tt="uppercase"
      >
        <Box flex="0 0 auto" w="12rem" px="xl" py="sm">{t`Font weight`}</Box>
        <Box flex="1 1 auto" px="xl" py="sm">{t`URL`}</Box>
      </Flex>
      <Box className={S.bodyBorder}>
        {getFontOptions().map((option) => (
          <FontFileRow
            key={option.name}
            url={urls[option.fontWeight]}
            option={option}
            onChange={onChange}
          />
        ))}
      </Box>
    </Box>
  );
};

interface FontFileRowProps {
  url?: string;
  option: FontFileOption;
  onChange: (option: FontFileOption, url: string) => void;
}

const FontFileRow = ({
  url,
  option,
  onChange,
}: FontFileRowProps): JSX.Element => {
  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onChange(option, event.currentTarget.value);
    },
    [option, onChange],
  );

  return (
    <Flex className={S.rowDivider} align="center" c="text-secondary">
      <Box flex="0 0 auto" w="12rem" px="xl" py="lg" fw={option.fontWeight}>
        {option.name}
        <Box component="span" c="text-disabled" ml="xxs">
          {option.fontWeight}
        </Box>
      </Box>
      <Box flex="1 1 auto" px="xl" py="lg">
        <TextInput
          defaultValue={url}
          placeholder="https://some.trusted.location/font-file.woff2"
          onBlur={handleBlur}
          aria-label={option.name}
        />
      </Box>
    </Flex>
  );
};
