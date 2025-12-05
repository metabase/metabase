import type { MouseEvent } from "react";

import EntityItem from "metabase/common/components/EntityItem";
import {
  ItemNameCell,
  MaybeItemLink,
} from "metabase/common/components/ItemsTable/BaseItemsTable.styled";
import { getIcon } from "metabase/lib/icon";
import * as Urls from "metabase/lib/urls";
import { FixedSizeIcon, type IconName, Skeleton } from "metabase/ui";

import type { ModelingItem } from "../types";

import S from "./NameCell.module.css";

interface NameCellProps {
  item?: ModelingItem;
}

const CONTAINER_NAME = "ItemsTableContainer";

const sharedProps = {
  containerName: CONTAINER_NAME,
};

function preventDefault(event: MouseEvent) {
  event.preventDefault();
}

export function NameCell({ item }: NameCellProps) {
  const headingId = item ? `${item.model}-${item.id}-heading` : "dummy-heading";

  const icon = item ? getIcon(item) : { name: "folder" as IconName };

  const itemUrl = item
    ? item.model === "metric"
      ? Urls.metric({ id: item.id, name: item.name, type: "metric" })
      : Urls.dataStudioModel(item.id)
    : undefined;

  return (
    <ItemNameCell
      data-testid={`${item?.model || "item"}-name`}
      aria-labelledby={headingId}
      {...sharedProps}
    >
      <MaybeItemLink
        to={itemUrl}
        className={S.nameLink}
        onClick={preventDefault}
      >
        <FixedSizeIcon
          size={16}
          {...icon}
          c="icon-primary"
          className={S.icon}
        />
        {item ? (
          <EntityItem.Name
            name={item.name || ""}
            variant="list"
            id={headingId}
          />
        ) : (
          <Skeleton natural h="16.8px" />
        )}
      </MaybeItemLink>
    </ItemNameCell>
  );
}
