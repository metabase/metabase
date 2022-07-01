import React, { FocusEvent, useCallback, useMemo } from "react";
import { t } from "ttag";
import Input from "metabase/core/components/Input";
import { FontFile, FontFileOption } from "./types";
import { FONT_OPTIONS, getFontFiles, getFontUrls } from "./utils";
import {
  TableBody,
  TableBodyCell,
  TableBodyCellLabel,
  TableBodyRow,
  TableHeader,
  TableHeaderCell,
  TableHeaderRow,
} from "./FontFileSettings.styled";

export interface FontFileSettingsProps {
  files: FontFile[];
  onChange: (files: FontFile[]) => void;
}

const FontFileSettings = ({
  files,
  onChange,
}: FontFileSettingsProps): JSX.Element => {
  const urls = useMemo(() => getFontUrls(files), [files]);

  const handleChange = useCallback(
    (option: FontFileOption, url: string) => {
      onChange(getFontFiles({ ...urls, [option.fontWeight]: url }));
    },
    [urls, onChange],
  );

  return <FontFileTable urls={urls} onChange={handleChange} />;
};

interface FontFileTableProps {
  urls: Record<string, string>;
  onChange: (option: FontFileOption, url: string) => void;
}

const FontFileTable = ({ urls, onChange }: FontFileTableProps): JSX.Element => {
  return (
    <div>
      <TableHeader>
        <TableHeaderRow>
          <TableHeaderCell>{t`Font weight`}</TableHeaderCell>
          <TableHeaderCell>{t`URL`}</TableHeaderCell>
        </TableHeaderRow>
      </TableHeader>
      <TableBody>
        {FONT_OPTIONS.map(option => (
          <FontFileRow
            key={option.name}
            url={urls[option.fontWeight]}
            option={option}
            onChange={onChange}
          />
        ))}
      </TableBody>
    </div>
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
        <Input defaultValue={url} size="small" fullWidth onBlur={handleBlur} />
      </TableBodyCell>
    </TableBodyRow>
  );
};

export default FontFileSettings;
