import type React from "react";
import { type MouseEvent, type Ref, forwardRef } from "react";
import { t } from "ttag";

import { useTranslateContent } from "metabase/i18n/hooks";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getIsEmbedding } from "metabase/selectors/embed";
import type { IconName } from "metabase/ui";
import { Flex, Icon, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NotebookCell } from "../NotebookCell";

import { getUrl } from "./utils";

type DataPickerTargetProps = {
  table?: Lib.TableMetadata | Lib.CardMetadata;
  query: Lib.Query;
  stageIndex: number;
  placeholder?: React.ReactNode;
  isDisabled?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onAuxClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  getTableIcon?: (tableInfo: Lib.TableDisplayInfo) => IconName;
  setIsOpened: (isOpened: boolean) => void;
};

export const DataPickerTarget = forwardRef(function DataPickerTarget(
  {
    table,
    query,
    stageIndex,
    placeholder = t`Select data`,
    isDisabled,
    getTableIcon = defaultGetTableIcon,
    setIsOpened,
  }: DataPickerTargetProps,
  ref: Ref<HTMLButtonElement>,
) {
  const tc = useTranslateContent();
  const tableInfo =
    table != null ? Lib.displayInfo(query, stageIndex, table) : undefined;
  const isEmbedding = useSelector(getIsEmbedding);

  const openDataSourceInNewTab = () => {
    if (isEmbedding) {
      return;
    }
    const url = getUrl({ query, table, stageIndex });
    if (url) {
      const subpathSafeUrl = Urls.getSubpathSafeUrl(url);
      Urls.openInNewTab(subpathSafeUrl);
    }
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const isCtrlOrMetaClick =
      (event.ctrlKey || event.metaKey) && event.button === 0;
    if (isCtrlOrMetaClick) {
      openDataSourceInNewTab();
    } else {
      setIsOpened(true);
    }
  };

  const handleAuxClick = (event: MouseEvent<HTMLButtonElement>) => {
    const isMiddleClick = event.button === 1;
    if (isMiddleClick) {
      openDataSourceInNewTab();
    } else {
      setIsOpened(true);
    }
  };

  return (
    <UnstyledButton
      ref={ref}
      c="inherit"
      fz="inherit"
      fw="inherit"
      p={NotebookCell.CONTAINER_PADDING}
      disabled={isDisabled}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
    >
      <Flex align="center" gap="xs">
        {tableInfo && (
          <Icon name={getTableIcon(tableInfo)} style={{ flexShrink: 0 }} />
        )}
        {tc(tableInfo?.displayName) ?? placeholder}
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
