import { type MouseEvent, type Ref, forwardRef } from "react";

import type { IconName } from "metabase/ui";
import { Flex, Icon, UnstyledButton } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { NotebookCell } from "../NotebookCell";

type DataPickerTargetProps = {
  tableInfo?: Lib.TableDisplayInfo;
  placeholder: string;
  isDisabled?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onAuxClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  getTableIcon?: (tableInfo: Lib.TableDisplayInfo) => IconName;
};

export const DataPickerTarget = forwardRef(function DataPickerTarget(
  {
    tableInfo,
    placeholder,
    isDisabled,
    onClick,
    onAuxClick,
    getTableIcon = defaultGetTableIcon,
  }: DataPickerTargetProps,
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <UnstyledButton
      ref={ref}
      c="inherit"
      fz="inherit"
      fw="inherit"
      p={NotebookCell.CONTAINER_PADDING}
      disabled={isDisabled}
      onClick={onClick}
      onAuxClick={onAuxClick}
    >
      <Flex align="center" gap="xs">
        {tableInfo && (
          <Icon name={getTableIcon(tableInfo)} style={{ flexShrink: 0 }} />
        )}
        {tableInfo?.displayName ?? placeholder}
      </Flex>
    </UnstyledButton>
  );
});
function defaultGetTableIcon(tableInfo: Lib.TableDisplayInfo): IconName {
  switch (true) {
    case tableInfo.isQuestion:
      return "table2";
    case tableInfo.isModel:
      return "model";
    case tableInfo.isMetric:
      return "metric";
    default:
      return "table";
  }
}
