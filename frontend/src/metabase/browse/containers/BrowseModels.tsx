import { useContext, useEffect, useState } from "react";

import _ from "underscore";
import { t } from "ttag";

import type { CollectionItemWithLastEditedInfo } from "metabase/components/LastEditInfoLabel/LastEditInfoLabel";
import type { Collection, CollectionItem } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import Link from "metabase/core/components/Link";
import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { ContentViewportContext } from "metabase/core/context/ContentViewportContext";

import type { useSearchListQuery } from "metabase/common/hooks";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";

import NoResults from "assets/img/no_results.svg";
import { Icon, Text } from "metabase/ui";
import { space } from "metabase/styled-components/theme";
import {
  CenteredEmptyState,
  CollectionHeaderContainer,
  GridContainer,
  LastEditedInfoSeparator,
  ModelCard,
  MultilineEllipsified,
} from "./BrowseData.styled";

interface Model extends CollectionItem {
  last_editor_common_name?: string | undefined;
  creator_common_name?: string | undefined;
  last_edited_at?: string | undefined;
  created_at?: string | undefined;
}

const emptyArray: Model[] = [];

export const BrowseModels = ({
  data: models = emptyArray,
  error,
  isLoading,
}: ReturnType<typeof useSearchListQuery>) => {
  // This provides a ref to the <main> rendered by AppContent in App.tsx
  const contentViewport = useContext(ContentViewportContext);

  const rem = parseInt(space(2));
  const gridGapSize = rem;
  const itemMinWidth = 15 * rem;

  useEffect(() => {
    const configureGrid = () => {
      if (!contentViewport) {
        return;
      }
      const gridOptions = getGridOptions(
        models,
        gridGapSize,
        itemMinWidth,
        contentViewport,
      );
      setGridOptions(gridOptions);
    };
    configureGrid();
    window.addEventListener("resize", configureGrid);
    return () => window.removeEventListener("resize", configureGrid);
  }, [models, gridGapSize, itemMinWidth, contentViewport]);

  const [gridOptions, setGridOptions] = useState<{
    cells: Cell[];
    width: number;
    columnWidth: number;
    columnCount: number;
    rowCount: number;
  } | null>(null);

  if (error) {
    return <LoadingAndErrorWrapper error />;
  } else if (isLoading || !gridOptions) {
    return (
      <LoadingAndErrorWrapper loading style={{ display: "flex", flex: 1 }} />
    );
  }

  const { cells } = gridOptions;

  return (
    <GridContainer>
      {cells ? (
        cells
      ) : (
        <CenteredEmptyState
          title={t`No models here yet`}
          message={t`Models help curate data to make it easier to find answers to questions all in one place.`}
          illustrationElement={<img src={NoResults} />}
        />
      )}
    </GridContainer>
  );
};

interface ModelCellProps {
  model: Model;
  style?: React.CSSProperties;
}

const ModelCell = ({ model, style }: ModelCellProps) => {
  const modelWithHistory = addLastEditInfo(model);
  return (
    <Link
      key={model.id}
      style={style}
      to={Urls.model(model)}
      // FIXME: Not sure that 'Model Click' is right; this is modeled on the database grid which has 'Database Click'
      data-metabase-event={`${ANALYTICS_CONTEXT};Model Click`}
    >
      <ModelCard>
        <h4 className="text-wrap" style={{ lineHeight: "16px" }}>
          <MultilineEllipsified>{model.name}</MultilineEllipsified>
        </h4>
        <Text size="xs" style={{ height: "32px" }}>
          <MultilineEllipsified
            tooltipMaxWidth="100%"
            className={model.description ? "" : "text-light"}
          >
            {model.description || "No description."}{" "}
          </MultilineEllipsified>
        </Text>
        <LastEditInfoLabel
          prefix={null}
          item={modelWithHistory}
          fullName={modelWithHistory["last-edit-info"].full_name}
          className={"last-edit-info-label-button"}
          // TODO: Simplify the formatLabel prop
          formatLabel={(
            fullName: string | undefined = "",
            timeLabel: string,
          ) => (
            <>
              {fullName}
              {fullName && timeLabel ? (
                <LastEditedInfoSeparator>•</LastEditedInfoSeparator>
              ) : null}
              {timeLabel}
            </>
          )}
        />
      </ModelCard>
    </Link>
  );
};

/** Sort models by (in descending order of priority): collection name, collection id, model name, model id. */
const sortModels = (a: Model, b: Model) => {
  const fallbackSortValue = Number.MAX_SAFE_INTEGER;

  // Sort first on the name of the model's parent collection, case insensitive
  const collectionNameA = a.collection?.name.toLowerCase() || fallbackSortValue;
  const collectionNameB = b.collection?.name.toLowerCase() || fallbackSortValue;

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
}: {
  collection?: Collection | null;
  style?: React.CSSProperties;
}) => {
  const MaybeLink = ({ children }: { children: React.ReactNode }) =>
    collection ? (
      <Link to={Urls.collection(collection)}>{children}</Link>
    ) : (
      <>{children}</>
    );
  return (
    <CollectionHeaderContainer style={style}>
      <MaybeLink>
        <Icon
          name="folder"
          color={"text-dark"}
          size={16}
          style={{ marginRight: "0.33rem" }}
        />
        <h4>{collection?.name || "Untitled collection"}</h4>
      </MaybeLink>
    </CollectionHeaderContainer>
  );
};

type Cell = React.ReactElement | null;

const makeCells = (models: Model[]): Cell[] => {
  const cells: Cell[] = [];
  for (let i = 0; i < models.length; i++) {
    const model = models[i];

    const collectionIdChanged =
      models[i - 1]?.collection?.id !== model.collection?.id;

    const firstModelInItsCollection =
      i === 0 || collectionIdChanged || model.collection?.id === undefined;

    // Before the first model in a given collection,
    // add an item that represents the header of the collection
    if (firstModelInItsCollection) {
      const header = <CollectionHeader collection={model.collection} />;
      cells.push(header);
    }
    cells.push(<ModelCell model={model} />);
  }
  return cells;
};

const getGridOptions = (
  models: Model[],
  gridGapSize: number,
  itemMinWidth: number,
  contentViewport: HTMLElement,
) => {
  const browseAppRoot = contentViewport.children[0];
  const width = browseAppRoot.clientWidth - gridGapSize;

  const calculateColumnCount = (width: number) => {
    return Math.floor((width + gridGapSize) / (itemMinWidth + gridGapSize));
  };

  const calculateItemWidth = (width: number, columnCount: number) => {
    return width / columnCount;
  };

  const sortedModels = [...models.map(model => ({ ...model }))].sort(
    sortModels,
  );

  const columnCount = calculateColumnCount(width);
  const columnWidth = calculateItemWidth(width, columnCount);
  const cells = makeCells(sortedModels);
  const rowCount = Math.ceil(cells.length / columnCount);

  return {
    columnCount,
    columnWidth,
    cells,
    rowCount,
    width,
  };
};

const addLastEditInfo = (model: Model): CollectionItemWithLastEditedInfo => ({
  ...model,
  "last-edit-info": {
    full_name: model.last_editor_common_name ?? model.creator_common_name,
    timestamp: model.last_edited_at ?? model.created_at ?? "",
  },
});
