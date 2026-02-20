import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  EntityPickerModal,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import { Button, Icon, Input } from "metabase/ui";
import type { ReplaceSourceEntry } from "metabase-types/api";

import type { EntityInfo } from "../../types";

import S from "./EntitySelect.module.css";
import {
  RECENTS_CONTEXT,
  SOURCE_PICKER_MODELS,
  SOURCE_PICKER_OPTIONS,
} from "./constants";
import {
  getEntityDisplayInfo,
  getPickerValue,
  getSelectedValue,
} from "./utils";

type EntitySelectProps = {
  entityInfo: EntityInfo | undefined;
  label: string;
  description: string;
  placeholder?: string;
  onChange: (entry: ReplaceSourceEntry) => void;
};

export function EntitySelect({
  entityInfo,
  label,
  description,
  placeholder = t`Pick a table, model, or saved question`,
  onChange,
}: EntitySelectProps) {
  const [isPickerOpen, { open: openPicker, close: closePicker }] =
    useDisclosure(false);
  const displayInfo = getEntityDisplayInfo(entityInfo);

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
          displayInfo != null && <Icon c="brand" name={displayInfo.icon} />
        }
        rightSection={<Icon name="chevrondown" />}
      >
        {displayInfo?.breadcrumbs.join(" / ") ?? placeholder}
      </Button>
      {isPickerOpen && (
        <EntityPickerModal
          title={t`Select a data source`}
          models={SOURCE_PICKER_MODELS}
          value={getPickerValue(entityInfo)}
          options={SOURCE_PICKER_OPTIONS}
          recentsContext={RECENTS_CONTEXT}
          onChange={handleItemSelect}
          onClose={closePicker}
        />
      )}
    </Input.Wrapper>
  );
}
