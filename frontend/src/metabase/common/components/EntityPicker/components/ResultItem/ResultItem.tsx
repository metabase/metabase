import { t } from "ttag";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import { humanize, titleize } from "metabase/lib/formatting";
import { getIcon } from "metabase/lib/icon";
import { getName } from "metabase/lib/name";
import { FixedSizeIcon, Flex, Tooltip } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import { ENTITY_PICKER_Z_INDEX } from "../EntityPickerModal";

import { ChunkyListItem } from "./ResultItem.styled";

export type ResultItemType = Pick<SearchResult, "model" | "name"> &
  Partial<
    Pick<
      SearchResult,
      | "id"
      | "collection"
      | "description"
      | "collection_authority_level"
      | "moderated_status"
      | "display"
      | "database_name"
      | "table_schema"
    >
  >;

export const ResultItem = ({
  item,
  onClick,
  isSelected,
  isLast,
}: {
  item: ResultItemType;
  onClick: () => void;
  isSelected?: boolean;
  isLast?: boolean;
}) => {
  const icon = getIcon(item);
  const parentInfo = getParentInfo(item);

  return (
    <ChunkyListItem
      aria-selected={isSelected}
      onClick={onClick}
      isSelected={isSelected}
      isLast={isLast}
      data-model-type={item.model}
      data-testid="result-item"
    >
      <Flex gap="md" miw="10rem" align="center" style={{ flex: 1 }}>
        <FixedSizeIcon
          color={color(icon.color ?? (isSelected ? "white" : "brand"))}
          name={icon.name}
          style={{
            flexShrink: 0,
          }}
        />
        <Ellipsified style={{ fontWeight: "bold" }}>
          {getName(item)}
        </Ellipsified>
        {item.description && (
          <Tooltip
            maw="20rem"
            multiline
            label={item.description}
            zIndex={ENTITY_PICKER_Z_INDEX}
          >
            <FixedSizeIcon color="brand" name="info" />
          </Tooltip>
        )}
      </Flex>

      {parentInfo && (
        <Flex
          style={{
            color: isSelected ? color("white") : color("text-light"),
            flexShrink: 0,
          }}
          align="center"
          gap="sm"
          w="20rem"
        >
          <FixedSizeIcon name={parentInfo.icon} />
          <Ellipsified>{t`in ${parentInfo.name}`}</Ellipsified>
        </Flex>
      )}
    </ChunkyListItem>
  );
};

function getParentInfo(item: ResultItemType) {
  if (item.model === "table") {
    const icon = getIcon({ model: "database" }).name;
    const databaseName = item.database_name ?? t`Database`;

    if (!item.table_schema) {
      return {
        icon,
        name: databaseName,
      };
    }

    return {
      icon,
      name: `${databaseName} (${titleize(humanize(item.table_schema))})`,
    };
  }

  if (item.model === "collection" && item?.collection?.id === item?.id) {
    // some APIs return collection items with themselves populated as their own parent 🥴
    return null;
  }

  if (!item.collection) {
    return null;
  }

  return {
    icon: getIcon({ model: "collection", ...item.collection }).name,
    name: getName(item.collection) || t`Our Analytics`,
  };
}
