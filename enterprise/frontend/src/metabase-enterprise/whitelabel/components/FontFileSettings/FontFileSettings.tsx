import React, { useCallback, FocusEvent } from "react";
import { t } from "ttag";
import _ from "underscore";
import Input from "metabase/core/components/Input";
import { FontFileOption } from "./types";
import {
  TableBody,
  TableBodyCell,
  TableBodyRow,
  TableHeader,
  TableHeaderCell,
  TableHeaderRow,
} from "./FontFileSettings.styled";

export interface FontFileSettingsProps {
  urls: Record<string, string>;
  options: FontFileOption[];
  onChange: (urls: Record<string, string>) => void;
}

const FontFileSettings = ({
  urls,
  options,
  onChange,
}: FontFileSettingsProps): JSX.Element => {
  const handleChange = useCallback(
    (option: FontFileOption, url: string) => {
      if (url) {
        onChange(_.assign({ ...urls }, { [option.fontWeight]: url }));
      } else {
        onChange(_.omit(urls, option.fontWeight.toString()));
      }
    },
    [urls, onChange],
  );

  return (
    <FontFileTable urls={urls} options={options} onChange={handleChange} />
  );
};

interface FontFileTableProps {
  urls: Record<string, string>;
  options: FontFileOption[];
  onChange: (option: FontFileOption, url: string) => void;
}

const FontFileTable = ({
  urls,
  options,
  onChange,
}: FontFileTableProps): JSX.Element => {
  return (
    <div>
      <TableHeader>
        <TableHeaderRow>
          <TableHeaderCell>{t`Font weight`}</TableHeaderCell>
          <TableHeaderCell>{t`URL`}</TableHeaderCell>
        </TableHeaderRow>
      </TableHeader>
      <TableBody>
        {options.map(option => (
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
      <TableBodyCell>{option.name}</TableBodyCell>
      <TableBodyCell>
        <Input defaultValue={url} onBlur={handleBlur} />
      </TableBodyCell>
    </TableBodyRow>
  );
};

export default FontFileSettings;
