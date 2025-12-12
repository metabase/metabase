import { useMemo } from "react"

import { OmniPickerContext } from "../context"
import { useGetPathFromValue } from "../hooks/use-get-path-from-value"
import type { OmniPickerItem } from "../types"
import { getItemFunctions } from "../utils"

import type { EntityPickerModalOptions } from "./EntityPickerModal"
import { ButtonBar } from "./EntityPickerModal/ButtonBar"
import { NestedItemPicker } from "./NestedItemPicker"

export type EntityPickerProps = {
  models: OmniPickerItem["model"];
  searchQuery?: string;
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
  searchQuery,
  initialValue,
  onChange,
  onCancel,
  options,
  isFolderItem: _isFolderItem,
  isHiddenItem: _isHiddenItem,
  isDisabledItem: _isDisabledItem,
  isSelectableItem: _isSelectableItem,
}: EntityPickerProps) {
  const [path, setPath, { isLoadingPath }] = useGetPathFromValue({
      value: initialValue
  });

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
      searchQuery,
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
