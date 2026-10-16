import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { DOCUMENT_TITLE_MAX_LENGTH } from "metabase/documents/constants";
import { Button, Group, Stack, Text } from "metabase/ui";
import type { ConcreteTableId } from "metabase-types/api";

import { EventTablePicker } from "../components/EventTablePicker";
import { DateRangeButton } from "../components/toolbar/DateRangeButton";

type AnalysisDocumentHeaderProps = {
  title: string;
  tableId: ConcreteTableId | undefined;
  dateRange: string;
  isTableLoading: boolean;
  canWrite: boolean;
  showSaveButton: boolean;
  onTitleChange: (title: string) => void;
  onTableChange: (tableId: ConcreteTableId) => void;
  onDateRangeChange: (dateRange: string) => void;
  onSave: () => void;
};

/** The document's title, and the event data and date range every analysis uses. */
export const AnalysisDocumentHeader = ({
  title,
  tableId,
  dateRange,
  isTableLoading,
  canWrite,
  showSaveButton,
  onTitleChange,
  onTableChange,
  onDateRangeChange,
  onSave,
}: AnalysisDocumentHeaderProps) => (
  <Stack gap="md">
    <Group justify="space-between" wrap="nowrap" align="flex-start">
      <EditableText
        initialValue={title}
        placeholder={t`New analysis`}
        fw="bold"
        fz="h2"
        lh="h2"
        p={0}
        flex={1}
        maxLength={DOCUMENT_TITLE_MAX_LENGTH}
        isDisabled={!canWrite}
        onContentChange={onTitleChange}
      />
      {showSaveButton && (
        <Button variant="filled" onClick={onSave}>{t`Save`}</Button>
      )}
    </Group>
    <Group gap="sm" wrap="wrap">
      <Text c="text-secondary">{t`Event data`}</Text>
      <EventTablePicker
        tableId={tableId}
        isLoading={isTableLoading}
        onChange={onTableChange}
      />
      <DateRangeButton
        id="analysis-document-date-range"
        value={dateRange}
        onChange={onDateRangeChange}
      />
    </Group>
  </Stack>
);
