import { t } from "ttag";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import { getIcon } from "metabase/lib/icon";
import { Icon, Flex, Tooltip } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import { ENTITY_PICKER_Z_INDEX } from "../EntityPickerModal";

import { ChunkyListItem } from "./ResultItem.styled";

export type ResultItemType = Pick<SearchResult, "model" | "name"> &
  Partial<
    Pick<
      SearchResult,
      | "collection"
      | "description"
      | "collection_authority_level"
      | "moderated_status"
      | "display"
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

  return (
    <ChunkyListItem
      onClick={onClick}
      isSelected={isSelected}
      isLast={isLast}
      data-testid="result-item"
    >
      <Flex gap="md" miw="10rem" align="center" style={{ flex: 1 }}>
        <Icon
          color={color(icon.color ?? (isSelected ? "white" : "brand"))}
          name={icon.name}
          style={{
            flexShrink: 0,
          }}
        />
        <Ellipsified style={{ fontWeight: "bold" }}>{item.name}</Ellipsified>
        {item.description && (
          <Tooltip
            maw="20rem"
            multiline
            label={item.description}
            zIndex={ENTITY_PICKER_Z_INDEX}
          >
            <Icon color="brand" name="info" />
          </Tooltip>
        )}
      </Flex>

      {item.model !== "collection" && ( // we don't hydrate parent info for collections right now
        <Flex
          style={{
            color: isSelected ? color("white") : color("text-light"),
            flexShrink: 0,
          }}
          align="center"
          gap="sm"
          w="20rem"
        >
          <Icon
            name={getIcon({ model: "collection", ...item.collection }).name}
            style={{ flexShrink: 0 }}
          />
          <Ellipsified>
            {t`in ${item.collection?.name ?? t`Our Analytics`}`}
          </Ellipsified>
        </Flex>
      )}
    </ChunkyListItem>
  );
};
