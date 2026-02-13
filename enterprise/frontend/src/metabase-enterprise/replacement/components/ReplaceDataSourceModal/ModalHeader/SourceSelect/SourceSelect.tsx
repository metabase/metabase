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

type SourceSelectProps = {
  entry: ReplaceSourceEntry | undefined;
  label: string;
  description: string;
  onChange: (entry: ReplaceSourceEntry) => void;
};

export function SourceSelect({
  entry,
  label,
  description,
  onChange,
}: SourceSelectProps) {
  const [isPickerOpen, { open: openPicker, close: closePicker }] =
    useDisclosure(false);

  const { data: table, isFetching: isTableFetching } = useGetTableQuery(
    entry?.type === "table" ? { id: entry.id } : skipToken,
  );
  const { data: card, isFetching: isCardFetching } = useGetCardQuery(
    entry?.type === "card" ? { id: entry.id } : skipToken,
  );

  const handleItemSelect = (item: OmniPickerItem) => {
    onChange(getSelectedValue(item));
    closePicker();
  };

  const sourceInfo = getSourceInfo(table, card);
  const isFetching = isTableFetching || isCardFetching;

  return (
    <Input.Wrapper label={label} description={description}>
      <Button
        className={S.button}
        onClick={openPicker}
        leftSection={sourceInfo != null && <Icon name={sourceInfo.icon} />}
        rightSection={
          isFetching ? <Loader size="xs" /> : <Icon name="chevrondown" />
        }
      >
        {sourceInfo?.breadcrumbs.join(" / ") ?? t`Select a data source`}
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
