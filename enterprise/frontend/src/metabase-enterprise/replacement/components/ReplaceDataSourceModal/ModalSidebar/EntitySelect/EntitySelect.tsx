import { useDisclosure } from "@mantine/hooks";
import { Fragment } from "react";
import { t } from "ttag";

import {
  EntityPickerModal,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import { Box, Button, Icon, Input } from "metabase/ui";
import type { DatabaseId, ReplaceSourceEntry } from "metabase-types/api";

import type { EntityItem } from "../../types";

import S from "./EntitySelect.module.css";
import {
  RECENTS_CONTEXT,
  SOURCE_PICKER_MODELS,
  SOURCE_PICKER_OPTIONS,
} from "./constants";
import type { EntityItemInfo } from "./types";
import {
  getEntityItem,
  getEntityItemInfo,
  getIsPickerItemDisabled,
  getPickerValue,
} from "./utils";

type EntitySelectProps = {
  selectedItem: EntityItem | undefined;
  label: string;
  description: string;
  placeholder?: string;
  databaseId?: DatabaseId;
  disabledItem?: EntityItem;
  onChange: (entry: ReplaceSourceEntry) => void;
};

export function EntitySelect({
  selectedItem,
  label,
  description,
  placeholder = t`Pick a table, model, or saved question`,
  databaseId,
  disabledItem,
  onChange,
}: EntitySelectProps) {
  const [isPickerOpen, { open: openPicker, close: closePicker }] =
    useDisclosure(false);
  const sourceInfo =
    selectedItem != null ? getEntityItemInfo(selectedItem) : undefined;
  const isDisabledItem =
    disabledItem != null
      ? getIsPickerItemDisabled(databaseId, disabledItem)
      : undefined;

  const handleItemSelect = (item: OmniPickerItem) => {
    const entry = getEntityItem(item);
    if (entry != null) {
      onChange(entry);
      closePicker();
    }
  };

  return (
    <Input.Wrapper label={label} description={description}>
      <Button
        className={S.button}
        rightSection={<Icon name="chevrondown" />}
        fw="normal"
        onClick={openPicker}
      >
        {sourceInfo ? <ButtonContent displayInfo={sourceInfo} /> : placeholder}
      </Button>
      {isPickerOpen && (
        <EntityPickerModal
          title={t`Select a data source`}
          models={SOURCE_PICKER_MODELS}
          value={
            selectedItem != null ? getPickerValue(selectedItem) : undefined
          }
          options={SOURCE_PICKER_OPTIONS}
          recentsContext={RECENTS_CONTEXT}
          isDisabledItem={isDisabledItem}
          onChange={handleItemSelect}
          onClose={closePicker}
        />
      )}
    </Input.Wrapper>
  );
}

type ButtonContentProps = {
  displayInfo: EntityItemInfo;
};

function ButtonContent({ displayInfo }: ButtonContentProps) {
  return (
    <span>
      {displayInfo.breadcrumbs.map((breadcrumb, index) => (
        <Fragment key={index}>
          <span>{breadcrumb}</span>
          <span> / </span>
        </Fragment>
      ))}
      <Box component="span" fw="bold">
        {displayInfo.name}
      </Box>
    </span>
  );
}
