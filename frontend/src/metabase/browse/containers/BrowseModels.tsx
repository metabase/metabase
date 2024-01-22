import { useEffect, useState } from "react";

import _ from "underscore";
import { jt, t } from "ttag";

import {
  getHowLongAgo,
  type ItemWithLastEditInfo,
} from "metabase/components/LastEditInfoLabel/LastEditInfoLabel";
import type { Card, Collection, SearchResult } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import Link from "metabase/core/components/Link";
import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import type { useSearchListQuery } from "metabase/common/hooks";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";

import NoResults from "assets/img/no_results.svg";
import { Box, Group, Icon, Text, Title } from "metabase/ui";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import {
  CenteredEmptyState,
  CollectionHeaderContainer,
  GridContainer,
  LastEditedInfoSeparator,
  ModelCard,
  MultilineEllipsified,
} from "./BrowseData.styled";

const emptyArray: SearchResult[] = [];

export const BrowseModels = ({
  data: models = emptyArray,
  error,
  isLoading,
}: ReturnType<typeof useSearchListQuery<SearchResult>>) => {
  useEffect(() => {
    const configureGrid = () => {
      const gridOptions = getGridOptions(models);
      setGridOptions(gridOptions);
    };
    configureGrid();
    window.addEventListener("resize", configureGrid);
    return () => window.removeEventListener("resize", configureGrid);
  }, [models]);

  const [gridOptions, setGridOptions] = useState<{
    cells: Cell[];
  } | null>(null);

  if (error) {
    return <LoadingAndErrorWrapper error />;
  } else if (isLoading || !gridOptions) {
    return (
      <LoadingAndErrorWrapper loading style={{ display: "flex", flex: 1 }} />
    );
  }

  const { cells = [] } = gridOptions;

  return cells.length ? (
    <GridContainer role="grid">{cells}</GridContainer>
  ) : (
    <CenteredEmptyState
      title={<Box mb=".5rem">{t`No models here yet`}</Box>}
      message={
        <Box maw="24rem">{t`Models help curate data to make it easier to find answers to questions all in one place.`}</Box>
      }
      illustrationElement={
        <Box mb=".5rem">
          <img src={NoResults} />
        </Box>
      }
    />
  );
};

interface ModelCellProps {
  model: SearchResult;
  style?: React.CSSProperties;
  collectionHtmlId: string;
}

const ModelCell = ({ model, style, collectionHtmlId }: ModelCellProps) => {
  const modelWithHistory = addLastEditInfo(model);
  const lastEdit = modelWithHistory["last-edit-info"];
  const lastEditorName = lastEdit.full_name;
  const howLongAgo = getHowLongAgo(lastEdit.timestamp);

  const headingId = `heading-for-model-${model.id}`;

  const formattedDate = formatDateTimeWithUnit(lastEdit.timestamp, "day", {});

  const time = <time dateTime={lastEdit.timestamp}>{formattedDate}</time>;
  const tooltipLabel = jt`Last edited by ${lastEditorName}${(<br />)}${time}`;

  return (
    <Link
      aria-labelledby={`${collectionHtmlId} ${headingId}`}
      key={model.id}
      style={style}
      to={Urls.model(model as unknown as Partial<Card>)}
      // FIXME: Not sure that 'Model Click' is right; this is modeled on the database grid which has 'Database Click'
      data-metabase-event={`${ANALYTICS_CONTEXT};Model Click`}
    >
      <ModelCard>
        <Title order={4} className="text-wrap" lh="1rem" mb=".5rem">
          <MultilineEllipsified id={headingId}>
            {model.name}
          </MultilineEllipsified>
        </Title>
        <Text h="2rem" size="xs" mb="auto">
          <MultilineEllipsified
            tooltipMaxWidth="100%"
            className={model.description ? "" : "text-light"}
          >
            {model.description || "No description."}{" "}
          </MultilineEllipsified>
        </Text>
        <LastEditInfoLabel
          item={modelWithHistory}
          fullName={modelWithHistory["last-edit-info"].full_name}
          className={"last-edit-info-label-button"}
          tooltipProps={{
            label: tooltipLabel,
            withArrow: true,
          }}
          // TODO: Use first name and last initial
        >
          {lastEditorName}
          {lastEditorName && howLongAgo ? (
            <LastEditedInfoSeparator>•</LastEditedInfoSeparator>
          ) : null}
          {howLongAgo}
        </LastEditInfoLabel>
      </ModelCard>
    </Link>
  );
};

/** Sort models firstly by collection name,
 * secondly by collection id,
 * thirdly by model name, and
 * lastly by model id. */
const sortModels = (a: SearchResult, b: SearchResult) => {
  const fallbackSortValue = Number.MAX_SAFE_INTEGER;

  // Sort first on the name of the model's parent collection, case insensitive
  const collectionNameA =
    a.collection?.name?.toLowerCase() || fallbackSortValue;
  const collectionNameB =
    b.collection?.name?.toLowerCase() || fallbackSortValue;

  if (collectionNameA < collectionNameB) {
    return -1;
  }
  if (collectionNameA > collectionNameB) {
    return 1;
  }

  // If the two models' parent collections have the same name, sort on the id of the collection
  const collectionIdA = a.collection?.id ?? fallbackSortValue;
  const collectionIdB = b.collection?.id ?? fallbackSortValue;

  if (collectionIdA < collectionIdB) {
    return -1;
  }
  if (collectionIdA > collectionIdB) {
    return 1;
  }

  const nameA = a.name.toLowerCase() || fallbackSortValue;
  const nameB = b.name.toLowerCase() || fallbackSortValue;

  // If the two collection ids are the same, sort on the names of the models
  if (nameA < nameB) {
    return -1;
  }
  if (nameA > nameB) {
    return 1;
  }

  // If the two models have the same name, sort on id
  const idA = a.id ?? fallbackSortValue;
  const idB = b.id ?? fallbackSortValue;

  if (idA < idB) {
    return -1;
  }
  if (idA > idB) {
    return 1;
  }

  return 0;
};

const CollectionHeader = ({
  collection,
  style,
  id,
}: {
  collection?: Pick<Collection, "id" | "name"> | null;
  style?: React.CSSProperties;
  id: string;
}) => {
  const MaybeLink = ({ children }: { children: React.ReactNode }) =>
    collection ? (
      <Group grow noWrap>
        <Link to={Urls.collection(collection)}>{children}</Link>
      </Group>
    ) : (
      <>{children}</>
    );
  return (
    <CollectionHeaderContainer id={id} role="heading" style={style}>
      <MaybeLink>
        <Group spacing=".33rem">
          <Icon name="folder" color={"text-dark"} size={16} />
          <Text>{collection?.name || "Untitled collection"}</Text>
        </Group>
      </MaybeLink>
    </CollectionHeaderContainer>
  );
};

type Cell = React.ReactElement | null;

const makeCells = (models: SearchResult[]): Cell[] => {
  const cells: Cell[] = [];
  for (let i = 0; i < models.length; i++) {
    const model = models[i];

    const collectionIdChanged =
      models[i - 1]?.collection?.id !== model.collection?.id;

    const firstModelInItsCollection =
      i === 0 || collectionIdChanged || model.collection?.id === undefined;

    /** This id is used by aria-labelledby */
    const collectionHtmlId = model?.collection?.id
      ? `collection-${model.collection?.id}`
      : `item-${cells.length}`;

    // Before the first model in a given collection,
    // add an item that represents the header of the collection
    if (firstModelInItsCollection) {
      const header = (
        <CollectionHeader
          collection={model.collection}
          key={collectionHtmlId}
          id={collectionHtmlId}
        />
      );
      cells.push(header);
    }

    cells.push(
      <ModelCell
        collectionHtmlId={collectionHtmlId}
        key={`model-${model.id}`}
        model={model}
      />,
    );
  }
  return cells;
};

const getGridOptions = (models: SearchResult[]) => {
  const sortedModels = models.sort(sortModels);
  const cells = makeCells(sortedModels);
  return { cells };
};

const addLastEditInfo = (model: SearchResult): ItemWithLastEditInfo => ({
  ...model,
  "last-edit-info": {
    full_name: model.last_editor_common_name ?? model.creator_common_name,
    timestamp: model.last_edited_at ?? model.created_at ?? "",
  },
});
