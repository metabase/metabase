import type { FocusEvent } from "react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import Input from "metabase/core/components/Input";
import type { FontFile } from "metabase-types/api";
import type { FontFileOption, FontFilesSetting } from "./types";
import { FONT_OPTIONS, getFontFiles, getFontUrls } from "./utils";
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

export interface FontFilesWidgetProps {
  setting: FontFilesSetting;
  onChange: (fontFiles: FontFile[]) => void;
}

const FontFilesWidget = ({
  setting,
  onChange,
}: FontFilesWidgetProps): JSX.Element => {
  const files = setting.value;
  const urls = useMemo(() => getFontUrls(files ?? []), [files]);

  const handleChange = useCallback(
    (option: FontFileOption, url: string) => {
      onChange(getFontFiles({ ...urls, [option.fontWeight]: url }));
    },
    [urls, onChange],
  );

  return <FontFilesTable urls={urls} onChange={handleChange} />;
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
    <TableRoot>
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
        <Input
          defaultValue={url}
          placeholder="https://some.trusted.location/font-file.woff2"
          fullWidth
          onBlur={handleBlur}
          aria-label={option.name}
        />
      </TableBodyCell>
    </TableBodyRow>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FontFilesWidget;
