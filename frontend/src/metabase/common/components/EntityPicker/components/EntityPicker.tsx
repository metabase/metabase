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
  isItemHidden?: (item: OmniPickerItem | unknown) => item is unknown;
  isItemDisabled?: (item: OmniPickerItem | unknown) => item is OmniPickerItem;
  onChange: (value: OmniPickerItem) => void;
  hasConfirmButtons?: boolean;
  options: EntityPickerModalOptions;
}

export function EntityPicker({
  models,
  initialValue,
  isFolderItem: _isFolderItem,
  isHiddenItem: _isHiddenItem,
  isDisabledItem: _isDisabledItem,
  isSelectableItem: _isSelectableItem,
  onChange,
  hasConfirmButtons = false,
  options,
}) {
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
      {hasConfirmButtons && <ButtonBar />}
    </OmniPickerContext.Provider>
  )
}
