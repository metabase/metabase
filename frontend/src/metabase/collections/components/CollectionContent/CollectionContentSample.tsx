import { t } from "ttag";
import _ from "underscore";

import {
  type CollectionSketch,
  getCollectionSketchItems,
} from "metabase/collections/collection-sketch";
import { EditableDescription } from "metabase/common/components/EditableDescription";
import { ItemsTable } from "metabase/common/components/ItemsTable";
import { getVisibleColumnsMap } from "metabase/common/components/ItemsTable/utils";
import { ActionIcon, Box, Flex, Icon, Text, rem } from "metabase/ui";
import type {
  CardDisplayType,
  Collection,
  CollectionItem,
  CollectionItemModel,
  IconName,
} from "metabase-types/api";

import S from "./CollectionContent.module.css";
import { DEFAULT_VISIBLE_COLUMNS_LIST } from "./constants";

// Typical names and edit info, so a first visit's skeleton has realistic line
// lengths. Later visits draw each collection's shape as last shown.
const SAMPLE_COLLECTION: Collection = {
  id: -1,
  name: "Marketing analytics",
  description: null,
  can_write: false,
  can_restore: false,
  can_delete: false,
  namespace: null,
  location: "/",
};

const SAMPLE_EDITORS = [
  { first_name: "Maya", last_name: "Chen" },
  { first_name: "Daniel", last_name: "Okafor" },
  { first_name: "Priya", last_name: "Natarajan" },
];

const SAMPLE_ITEMS: {
  model: CollectionItemModel;
  name: string;
  display?: CardDisplayType;
  timestamp: string;
}[] = [
  {
    model: "card",
    name: "Ad spend vs. revenue by quarter",
    display: "bar",
    timestamp: "2026-11-18T15:24:00Z",
  },
  {
    model: "dataset",
    name: "Campaign performance",
    timestamp: "2026-11-02T09:10:00Z",
  },
  {
    model: "card",
    name: "Email open rate by segment",
    display: "line",
    timestamp: "2026-10-27T13:45:00Z",
  },
  {
    model: "dataset",
    name: "Leads",
    timestamp: "2026-09-14T11:05:00Z",
  },
  {
    model: "dashboard",
    name: "Marketing KPIs",
    timestamp: "2026-11-20T16:30:00Z",
  },
  {
    model: "dashboard",
    name: "Paid acquisition overview",
    timestamp: "2026-10-08T08:55:00Z",
  },
  {
    model: "card",
    name: "Top referring domains",
    display: "table",
    timestamp: "2026-11-12T10:20:00Z",
  },
  {
    model: "card",
    name: "Weekly signups by channel",
    display: "line",
    timestamp: "2026-11-21T14:00:00Z",
  },
];

const SAMPLE_COLLECTION_ITEMS: CollectionItem[] = SAMPLE_ITEMS.map(
  ({ model, name, display, timestamp }, index) => {
    const editor = SAMPLE_EDITORS[index % SAMPLE_EDITORS.length];
    return {
      id: -(index + 1),
      model,
      name,
      display,
      description: null,
      "last-edit-info": { id: -1, email: "", ...editor, timestamp },
    };
  },
);

const SAMPLE_HEADER_ACTIONS: IconName[] = [
  "add_folder",
  "upload",
  "calendar",
  "bookmark",
  "info",
  "ellipsis",
];

const SAMPLE_VISIBLE_COLUMNS_MAP = getVisibleColumnsMap(
  DEFAULT_VISIBLE_COLUMNS_LIST,
);

// Skullet draws nothing for an element with this attribute
const SKULLET_IGNORE = { "skullet-ignore": "" };

/**
 * The collection and its rows to draw a skeleton from: the collection as last
 * shown, or typical ones for a collection never shown before.
 */
export const getCollectionSample = (
  sketch: CollectionSketch | null,
): { collection: Collection; items: CollectionItem[] } => ({
  collection: {
    ...SAMPLE_COLLECTION,
    can_write: sketch?.canWrite ?? SAMPLE_COLLECTION.can_write,
  },
  items: sketch?.items
    ? getCollectionSketchItems(sketch.items)
    : SAMPLE_COLLECTION_ITEMS,
});

/**
 * The collection's name and description. The name is plain text rather than
 * the real EditableText, whose text sits in a textarea skullet can only draw
 * as one block.
 */
const CollectionCaptionSample = ({
  sketch,
}: {
  sketch: CollectionSketch | null;
}) => (
  <Box>
    <Flex align="center" gap="sm">
      <Icon name="folder" size={24} />
      <Box
        component="h1"
        m={0}
        p="calc(0.25rem + 1px)"
        fz={rem(28)}
        fw={900}
        lh={1.57}
      >
        {sketch?.name ?? SAMPLE_COLLECTION.name}
      </Box>
    </Flex>
    {sketch?.description ? (
      <Text p="calc(0.25rem + 1px)" lh={1.57} maw={rem(400)}>
        {sketch.description}
      </Text>
    ) : (
      sketch?.isEditable && (
        // The unseen "Add description" an editable collection reserves room for
        <Box {...SKULLET_IGNORE}>
          <EditableDescription
            description={null}
            placeholder={t`Add description`}
            canWrite={false}
            maw={rem(400)}
            opacity={0}
            onChange={_.noop}
          />
        </Box>
      )
    )}
  </Box>
);

/**
 * The collection page's header and items table, rendered purely from the
 * collection as last shown, or sample data, for a measured skeleton to stand
 * in for the page while it loads.
 */
export const CollectionContentSample = ({
  sketch,
}: {
  sketch: CollectionSketch | null;
}) => {
  const { collection, items } = getCollectionSample(sketch);

  return (
    <Box className={S.root} h="100%" bg="background_page-secondary">
      <Box className={S.main} mx="auto" mah="100%" px="5%" py="lg">
        <Flex
          justify="space-between"
          direction={{ base: "column", sm: "row" }}
          align={{ base: "stretch", sm: "center" }}
          mb="xxl"
          pt={{ base: "xxs", sm: "sm" }}
        >
          <CollectionCaptionSample sketch={sketch} />
          <Flex mt="sm" gap="sm" style={{ alignSelf: "start" }}>
            {SAMPLE_HEADER_ACTIONS.map((icon) => (
              <ActionIcon key={icon} variant="subtle">
                <Icon name={icon} />
              </ActionIcon>
            ))}
          </Flex>
        </Flex>
        <Box h={rem(16)} />
        <ItemsTable
          items={items}
          collection={collection}
          sortingOptions={{ sort_column: "name", sort_direction: "asc" }}
          visibleColumnsMap={SAMPLE_VISIBLE_COLUMNS_MAP}
        />
      </Box>
    </Box>
  );
};
