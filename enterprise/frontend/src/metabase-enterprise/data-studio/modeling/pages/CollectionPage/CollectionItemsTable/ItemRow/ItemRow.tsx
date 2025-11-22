import type { MouseEvent } from "react";
import { useCallback } from "react";
import { push } from "react-router-redux";

import { TableRow } from "metabase/browse/components/BrowseTable.styled";
import { Columns } from "metabase/common/components/ItemsTable/Columns";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";

import { DescriptionCell } from "../DescriptionCell";
import { MenuCell } from "../MenuCell";
import { NameCell } from "../NameCell";
import type { ModelingItem } from "../types";

interface ItemRowProps {
  item?: ModelingItem;
}

export function ItemRow({ item }: ItemRowProps) {
  const dispatch = useDispatch();

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!item) {
        return;
      }

      const selection = document.getSelection();
      if (selection?.type === "Range") {
        event.stopPropagation();
        return;
      }

      const { id, model } = item;
      const url =
        model === "metric"
          ? Urls.dataStudioMetric(id)
          : Urls.dataStudioModel(id);
      const subpathSafeUrl = Urls.getSubpathSafeUrl(url);

      event.preventDefault();
      event.stopPropagation();

      if ((event.ctrlKey || event.metaKey) && event.button === 0) {
        Urls.openInNewTab(subpathSafeUrl);
      } else {
        dispatch(push(url));
      }
    },
    [item, dispatch],
  );

  return (
    <TableRow onClick={handleClick}>
      <NameCell item={item} />
      <DescriptionCell item={item} />
      <MenuCell item={item} />
      <Columns.RightEdge.Cell />
    </TableRow>
  );
}
