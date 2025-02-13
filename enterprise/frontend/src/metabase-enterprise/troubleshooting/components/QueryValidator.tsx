import { useMemo, useState } from "react";
import { Link } from "react-router";
import { jt, t } from "ttag";
import _ from "underscore";

import { useGetCollectionQuery } from "metabase/api";
import {
  getCollectionName,
  getCollectionPathAsString,
} from "metabase/collections/utils";
import {
  CollectionPickerModal,
  type CollectionPickerValueItem,
} from "metabase/common/components/CollectionPicker";
import { EllipsifiedPath } from "metabase/common/components/EllipsifiedPath";
import { Table } from "metabase/common/components/Table";
import { useSetting } from "metabase/common/hooks";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { usePagination } from "metabase/hooks/use-pagination";
import { formatDateTimeWithUnit } from "metabase/lib/formatting/date";
import * as Urls from "metabase/lib/urls";
import {
  Box,
  Button,
  FixedSizeIcon,
  Flex,
  Icon,
  type IconName,
  Text,
  Title,
} from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import { useGetInvalidCardsQuery } from "metabase-enterprise/api";
import type { CollectionId } from "metabase-types/api";
import { SortDirection } from "metabase-types/api/sorting";

import { formatErrorString } from "../utils";

import S from "./QueryValidator.module.css";

const COLUMNS = [
  { name: "Question", key: "name" },
  { name: "Error", key: "error", sortable: false },
  { name: "Collection", key: "collection" },
  { name: "Created by", key: "created_by" },
  { name: "Last edited", key: "last_edited_at" },
];

const PAGE_SIZE = 15;

type TableRow = {
  name: string;
  created_by: string;
  collectionTooltip: string;
  collection_path: string[];
  error: string;
  last_edited_at: string;
  id: number;
  icon: IconName;
  questionLink: string;
  collectionLink: string;
};

export const QueryValidator = () => {
  const queryAnalysisEnabled = useSetting("query-analysis-enabled");
  const [sortColumn, setSortColumn] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    SortDirection.Asc,
  );
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [collectionId, setCollectionId] = useState<CollectionId>("root");
  const isRootCollection = collectionId === "root";

  const { setPage, page } = usePagination();

  const { data: collection, isLoading: loadingCollection } =
    useGetCollectionQuery(
      {
        id: collectionId,
      },
      {
        skip: isRootCollection || !queryAnalysisEnabled,
      },
    );

  const { data: invalidCards } = useGetInvalidCardsQuery(
    {
      sort_column: sortColumn,
      sort_direction: sortDirection,
      limit: PAGE_SIZE,
      offset: PAGE_SIZE * page,
      collection_id: isRootCollection ? undefined : collectionId,
    },
    {
      refetchOnMountOrArgChange: true,
      skip: !queryAnalysisEnabled,
    },
  );

  const handleCollectionChange = (item: CollectionPickerValueItem) => {
    if (item.model !== "collection") {
      throw new Error("QueryValidator requires a collection as a filter");
    }
    setCollectionId(item.id);
    setCollectionPickerOpen(false);
  };

  const processedData: TableRow[] = useMemo(
    () =>
      invalidCards?.data.map(card => ({
        name: card.name,
        created_by: card.creator?.common_name || "",
        collectionTooltip: getCollectionPathAsString(card.collection),
        collection_path: [
          ...(card.collection?.effective_ancestors || []),
          card.collection,
        ].map(c => getCollectionName(c)),
        error: formatErrorString(card.errors),
        last_edited_at: card.updated_at,
        id: card.id,
        icon: getIconForVisualizationType(card.display),
        questionLink: Urls.question(card),
        collectionLink: Urls.collection(card.collection),
      })) || [],
    [invalidCards],
  );

  return queryAnalysisEnabled ? (
    <>
      <Box>
        <Flex mb="2rem" justify="space-between" align="center">
          <Title>{t`Questions with invalid references`}</Title>
          <Button
            rightIcon={<Icon name="chevrondown" size={14} />}
            miw="235px"
            styles={{
              inner: {
                justifyContent: "space-between",
                color: isRootCollection
                  ? "var(--mb-color-text-light)"
                  : "var(--mb-color-text-medium)",
                fontWeight: "normal",
              },
              root: { "&:active": { transform: "none" } },
            }}
            onClick={() => setCollectionPickerOpen(true)}
          >
            {isRootCollection || loadingCollection
              ? t`All Collections`
              : collection?.name}
          </Button>
        </Flex>
        <Table
          className={S.table}
          columns={COLUMNS}
          rows={processedData}
          rowRenderer={row => <QueryValidatorRow row={row} />}
          sortColumnName={sortColumn}
          sortDirection={sortDirection}
          onSort={(name, direction) => {
            setSortColumn(name);
            setSortDirection(direction);
            setPage(0);
          }}
          paginationProps={{
            onPageChange: setPage,
            page,
            total: invalidCards?.total,
            pageSize: PAGE_SIZE,
          }}
          emptyBody={<QueryValidatorEmpty />}
        />
      </Box>
      {collectionPickerOpen && (
        <CollectionPickerModal
          title={t`Select a collection`}
          value={{ id: collectionId, model: "collection" }}
          onChange={handleCollectionChange}
          onClose={() => setCollectionPickerOpen(false)}
          options={{
            hasRecents: false,
            showRootCollection: true,
            showPersonalCollections: true,
          }}
        />
      )}
    </>
  ) : (
    <Flex justify="center" p="1rem">
      <Text fz="1rem" color="var(--mb-color-text-light)">
        {jt`Query Validation is currently disabled. ${(
          <Text
            key="text"
            fz="inherit"
            color="var(--mb-color-brand)"
            component={Link}
            to="/admin/settings/general#query-analysis-enabled"
          >
            {t`Please enable query analysis here.`}
          </Text>
        )}`}
      </Text>
    </Flex>
  );
};

const QueryValidatorEmpty = () => (
  <tr>
    <td colSpan={5}>
      <Flex justify="center" p="1rem">
        <Text fz="1rem" color="var(--mb-color-text-light)">
          {t`No questions, models, or metrics with invalid references`}
        </Text>
      </Flex>
    </td>
  </tr>
);

const QueryValidatorRow = ({ row }: { row: TableRow }) => {
  return (
    <tr>
      <td className={`${CS.textBold} ${CS.py2}`}>
        <Link to={row.questionLink}>
          <Ellipsified style={{ color: "var(--mb-color-brand)" }}>
            {row.icon && (
              <Icon
                name={row.icon}
                style={{ verticalAlign: "bottom", marginInlineEnd: "0.75rem" }}
              />
            )}
            {row.name}
          </Ellipsified>
        </Link>
      </td>
      <td>{row.error}</td>
      <td width="100%">
        <Link to={row.collectionLink} className={S.collectionLink}>
          <Flex gap="sm">
            <FixedSizeIcon name="folder" />
            <Box w="calc(100% - 1.5rem)">
              <EllipsifiedPath
                items={row.collection_path}
                tooltip={row.collectionTooltip}
              />
            </Box>
          </Flex>
        </Link>
      </td>
      <td>{row.created_by}</td>
      <td>{formatDateTimeWithUnit(row.last_edited_at, "day")}</td>
    </tr>
  );
};
