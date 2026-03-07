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
import type { FontFilesSetting } from "./types";
import type { FontSlot } from "./utils";
import {
  getFontFilesFromSlots,
  getFontOptions,
  getFontSlots,
} from "./utils";

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

  const slots = useMemo(() => getFontSlots(files ?? []), [files]);

  const updateSlots = useCallback(
    async (nextSlots: FontSlot[]) => {
      await updateSetting({
        key: "application-font-files",
        value: getFontFilesFromSlots(nextSlots),
      });
    },
    [updateSetting],
  );

  const handleUrlChange = useCallback(
    async (slotKey: number, url: string) => {
      const nextSlots = slots.map((slot) =>
        slot.slotKey === slotKey ? { ...slot, url } : slot,
      );
      await updateSlots(nextSlots);
    },
    [slots, updateSlots],
  );

  const handleWeightChange = useCallback(
    async (slotKey: number, weight: number) => {
      const nextSlots = slots.map((slot) =>
        slot.slotKey === slotKey ? { ...slot, weight } : slot,
      );
      await updateSlots(nextSlots);
    },
    [slots, updateSlots],
  );

  return (
    <Stack mt="md" gap="sm">
      <Text c="text-secondary">{fontFilesDescription}</Text>
      <FontFilesTable
        slots={slots}
        onUrlChange={handleUrlChange}
        onWeightChange={handleWeightChange}
      />
    </Stack>
  );
};

interface FontFilesTableProps {
  slots: FontSlot[];
  onUrlChange: (slotKey: number, url: string) => void;
  onWeightChange: (slotKey: number, weight: number) => void;
}

const FontFilesTable = ({
  slots,
  onUrlChange,
  onWeightChange,
}: FontFilesTableProps): JSX.Element => {
  const options = getFontOptions();
  return (
    <TableRoot data-testid="font-files-widget">
      <TableHeader>
        <TableHeaderRow>
          <TableHeaderCell>{t`Style`}</TableHeaderCell>
          <TableHeaderCell>{t`Weight`}</TableHeaderCell>
          <TableHeaderCell>{t`URL`}</TableHeaderCell>
        </TableHeaderRow>
      </TableHeader>
      <TableBody>
        {slots.map((slot, index) => (
          <FontFileRow
            key={slot.slotKey}
            slot={slot}
            name={options[index].name}
            onUrlChange={onUrlChange}
            onWeightChange={onWeightChange}
          />
        ))}
      </TableBody>
    </TableRoot>
  );
};

interface FontFileRowProps {
  slot: FontSlot;
  name: string;
  onUrlChange: (slotKey: number, url: string) => void;
  onWeightChange: (slotKey: number, weight: number) => void;
}

const FontFileRow = ({
  slot,
  name,
  onUrlChange,
  onWeightChange,
}: FontFileRowProps): JSX.Element => {
  const handleUrlBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onUrlChange(slot.slotKey, event.currentTarget.value);
    },
    [slot.slotKey, onUrlChange],
  );

  const handleWeightChange = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      const value = parseInt(event.currentTarget.value, 10);
      if (!Number.isNaN(value) && value >= 1 && value <= 999) {
        onWeightChange(slot.slotKey, value);
      }
    },
    [slot.slotKey, onWeightChange],
  );

  return (
    <TableBodyRow>
      <TableBodyCell fontWeight={slot.weight}>
        {name}
        <TableBodyCellLabel>{slot.slotKey}</TableBodyCellLabel>
      </TableBodyCell>
      <TableBodyCell>
        <TextInput
          key={`weight-${slot.slotKey}-${slot.weight}`}
          defaultValue={slot.weight}
          type="number"
          min={1}
          max={999}
          onBlur={handleWeightChange}
          aria-label={t`Weight for ${name}`}
          styles={{ input: { width: 80 } }}
        />
      </TableBodyCell>
      <TableBodyCell>
        <TextInput
          key={slot.slotKey}
          defaultValue={slot.url}
          placeholder="https://some.trusted.location/font-file.woff2"
          onBlur={handleUrlBlur}
          aria-label={name}
        />
      </TableBodyCell>
    </TableBodyRow>
  );
};
