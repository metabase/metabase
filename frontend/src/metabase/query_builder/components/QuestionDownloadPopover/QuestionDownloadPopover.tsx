import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import type {
  ExportFormat,
  TableExportFormat,
} from "metabase/common/types/export";
import { useUserKeyValue } from "metabase/hooks/use-user-key-value";
import { exportFormatPng, exportFormats } from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import {
  ActionIcon,
  type ActionIconProps,
  Flex,
  Icon,
  Popover,
  Tooltip,
} from "metabase/ui";
import { canSavePng } from "metabase/visualizations";
import type { Dataset } from "metabase-types/api";

import { QuestionDownloadWidget } from "../QuestionDownloadWidget";
import {
  type UseDownloadDataParams,
  useDownloadData,
} from "../QuestionDownloadWidget/use-download-data";

import S from "./QuestionDownloadPopover.module.css";

export type QuestionDownloadPopoverProps = {
  className?: string;
  floating?: boolean;
} & Pick<UseDownloadDataParams, "question" | "result"> &
  Pick<ActionIconProps, "variant"> &
  Partial<Omit<UseDownloadDataParams, "question" | "result">>;

export type FormatPreference = {
  last_download_format: ExportFormat;
  last_table_download_format: TableExportFormat;
};

export type BaseQuestionDownloadPopoverProps = QuestionDownloadPopoverProps & {
  formatPreference?: FormatPreference;
  setFormatPreference?: (
    preference: FormatPreference,
  ) => Promise<{ data?: unknown; error?: unknown }>;
};

const BaseQuestionDownloadPopover = ({
  className,
  question,
  result,
  dashboardId,
  dashcardId,
  uuid,
  token,
  visualizationSettings,
  variant,
  floating,
  formatPreference,
  setFormatPreference,
}: BaseQuestionDownloadPopoverProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const [, handleDownload] = useDownloadData({
    question,
    result,
    dashboardId,
    dashcardId,
    uuid,
    token,
    visualizationSettings,
  });

  return (
    <Popover opened={isPopoverOpen} onChange={setIsPopoverOpen}>
      <Popover.Target>
        <Flex className={cx(className, { [S.FloatingButton]: floating })}>
          <Tooltip label={t`Download results`} disabled={isPopoverOpen}>
            <ActionIcon
              data-testid="question-results-download-button"
              onClick={() => setIsPopoverOpen(!isPopoverOpen)}
              aria-label={t`Download results`}
              variant={variant}
            >
              <Icon name="download" />
            </ActionIcon>
          </Tooltip>
        </Flex>
      </Popover.Target>
      <Popover.Dropdown p="0.75rem">
        <QuestionDownloadWidget
          question={question}
          result={result}
          formatPreference={formatPreference}
          setFormatPreference={setFormatPreference}
          onDownload={(opts) => {
            setIsPopoverOpen(false);
            handleDownload(opts);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

export const QuestionDownloadPopover = (
  props: QuestionDownloadPopoverProps,
) => {
  const canDownloadPng = canSavePng(props.question.display());
  const formats = canDownloadPng
    ? [...exportFormats, exportFormatPng]
    : exportFormats;

  const { value: formatPreference, setValue: setFormatPreference } =
    useUserKeyValue({
      namespace: "last_download_format",
      key: "download_format_preference",
      defaultValue: {
        last_download_format: formats[0],
        last_table_download_format: exportFormats[0],
      },
    });

  return (
    <BaseQuestionDownloadPopover
      {...props}
      formatPreference={formatPreference}
      setFormatPreference={setFormatPreference}
    />
  );
};

export const PublicOrEmbeddedQuestionDownloadPopover = (
  props: QuestionDownloadPopoverProps,
) => {
  const formatPreference = {
    last_download_format: "csv" as const,
    last_table_download_format: "csv" as const,
  };

  return (
    <BaseQuestionDownloadPopover
      {...props}
      formatPreference={formatPreference}
    />
  );
};

interface ShouldRenderDownloadPopoverProps {
  result?: Dataset;
}

const shouldRender = ({ result }: ShouldRenderDownloadPopoverProps) => {
  return (
    result &&
    !result.error &&
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults(result)
  );
};

QuestionDownloadPopover.shouldRender = shouldRender;
PublicOrEmbeddedQuestionDownloadPopover.shouldRender = shouldRender;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionDownloadPopover;
