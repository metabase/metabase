import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { skipToken, useGetCardQuery, useGetTableQuery } from "metabase/api";
import {
  EntityPickerModal,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import { Button, Icon, Input, Loader } from "metabase/ui";
import type { ReplaceSourceEntry } from "metabase-types/api";

import S from "./SourceSelect.module.css";
import {
  RECENTS_CONTEXT,
  SOURCE_PICKER_MODELS,
  SOURCE_PICKER_OPTIONS,
} from "./constants";
import { getPickerValue, getSelectedValue, getSourceInfo } from "./utils";

type EntitySelectProps = {
  entry: ReplaceSourceEntry | undefined;
  label: string;
  description: string;
  placeholder: string;
  onChange: (entry: ReplaceSourceEntry) => void;
};

export function EntitySelect({
  entry,
  label,
  description,
  placeholder,
  onChange,
}: EntitySelectProps) {
  const [isPickerOpen, { open: openPicker, close: closePicker }] =
    useDisclosure(false);
  const { data: table, isFetching: isTableFetching } = useGetTableQuery(
    entry?.type === "table" ? { id: entry.id } : skipToken,
  );
  const { data: card, isFetching: isCardFetching } = useGetCardQuery(
    entry?.type === "card" ? { id: entry.id } : skipToken,
  );
  const sourceInfo = getSourceInfo(entry, table, card);
  const isFetching = isTableFetching || isCardFetching;

  const handleItemSelect = (item: OmniPickerItem) => {
    onChange(getSelectedValue(item));
    closePicker();
  };

  return (
    <Input.Wrapper label={label} description={description}>
      <Button
        className={S.button}
        onClick={openPicker}
        leftSection={
          sourceInfo != null && <Icon c="brand" name={sourceInfo.icon} />
        }
        rightSection={
          isFetching ? <Loader size="xs" /> : <Icon name="chevrondown" />
        }
      >
        {sourceInfo?.breadcrumbs.join(" / ") ?? placeholder}
      </Button>
      {isPickerOpen && (
        <EntityPickerModal
          title={t`Select a data source`}
          models={SOURCE_PICKER_MODELS}
          value={getPickerValue(table, card)}
          options={SOURCE_PICKER_OPTIONS}
          recentsContext={RECENTS_CONTEXT}
          onChange={handleItemSelect}
          onClose={closePicker}
        />
      )}
    </Input.Wrapper>
  );
}
