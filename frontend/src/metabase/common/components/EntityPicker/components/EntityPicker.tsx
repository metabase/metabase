import { useMemo, useState } from "react"

import { Box } from "metabase/ui"

import { OmniPickerContext } from "../context"
import type { OmniPickerItem } from "../types"
import { getItemFunctions } from "../utils"

import type { EntityPickerModalOptions } from "./EntityPickerModal"
import { ButtonBar } from "./EntityPickerModal/ButtonBar"
import { NestedItemPicker } from "./NestedItemPicker"

export type EntityPickerProps = {
  models: OmniPickerItem["model"];
  initialValue?: OmniPickerItem;
  onChange: (value: OmniPickerItem) => void;
  onCancel?: () => void;
  options: EntityPickerModalOptions;
  isFolderItem?: (item: OmniPickerItem) => boolean;
  isHiddenItem?: (item: OmniPickerItem) => boolean;
  isDisabledItem?: (item: OmniPickerItem) => boolean;
  isSelectableItem?: (item: OmniPickerItem) => boolean;
  hasConfirmButtons?: boolean;
}

export function EntityPicker({
  models,
  initialValue,
  onChange,
  onCancel,
  options,
  isFolderItem: _isFolderItem,
  isHiddenItem: _isHiddenItem,
  isDisabledItem: _isDisabledItem,
  isSelectableItem: _isSelectableItem,
}: EntityPickerProps) {
  const [path, setPath] = useState<OmniPickerItem[]>([]);

  const {
    isFolderItem,
    isHiddenItem,
    isDisabledItem,
    isSelectableItem,
  } = useMemo(() => getItemFunctions({
    models,
    isFolderItem: _isFolderItem,
    isHiddenItem: _isHiddenItem,
    isDisabledItem: _isDisabledItem,
    isSelectableItem: _isSelectableItem,
  }), [
    models,
    _isFolderItem,
    _isHiddenItem,
    _isDisabledItem,
    _isSelectableItem,
  ]);
  console.log({ options });

  return (
    <OmniPickerContext.Provider value={{
      models,
      initialValue,
      isFolderItem,
      isHiddenItem,
      isDisabledItem,
      isSelectableItem,
      onChange,
      path,
      setPath,
      options,
    }}>
      <NestedItemPicker />
      {options.hasConfirmButtons && (
        <ButtonBar
          onConfirm={onChange}
          onCancel={onCancel}
          actionButtons={options.actionButtons}
          confirmButtonText={options.confirmButtonText}
          cancelButtonText={options.cancelButtonText}
        />
      )}
    </OmniPickerContext.Provider>
  )
}
