import type { FocusEvent } from "react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { Stack, Text, TextInput } from "metabase/ui";
import type { FontFile } from "metabase-types/api";

import {
  TableBody,
  TableBodyCell,
  TableBodyCellLabel,
  TableBodyRow,
  TableHeader,
  TableHeaderCell,
  TableHeaderRow,
  TableRoot,
} from "./FontFilesWidget.styled";
import type { FontFileOption, FontFilesSetting } from "./types";
import { getFontFiles, getFontOptions, getFontUrls } from "./utils";

export interface FontFilesWidgetProps {
  setting: FontFilesSetting;
  onChange: (fontFiles: FontFile[]) => void;
}

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
    <Stack mt="md" gap="sm">
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
    <TableRoot data-testid="font-files-widget">
      <TableHeader>
        <TableHeaderRow>
          <TableHeaderCell>{t`Font weight`}</TableHeaderCell>
          <TableHeaderCell>{t`URL`}</TableHeaderCell>
        </TableHeaderRow>
      </TableHeader>
      <TableBody>
        {getFontOptions().map((option) => (
          <FontFileRow
            key={option.name}
            url={urls[option.fontWeight]}
            option={option}
            onChange={onChange}
          />
        ))}
      </TableBody>
    </TableRoot>
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
    <TableBodyRow>
      <TableBodyCell fontWeight={option.fontWeight}>
        {option.name}
        <TableBodyCellLabel>{option.fontWeight}</TableBodyCellLabel>
      </TableBodyCell>
      <TableBodyCell>
        <TextInput
          defaultValue={url}
          placeholder="https://some.trusted.location/font-file.woff2"
          onBlur={handleBlur}
          aria-label={option.name}
        />
      </TableBodyCell>
    </TableBodyRow>
  );
};
