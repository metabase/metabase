import { useEffect, useState } from "react";

import _ from "underscore";
import { t } from "ttag";

import {
  getHowLongAgo,
  type CollectionItemWithLastEditInfo,
} from "metabase/components/LastEditInfoLabel/LastEditInfoLabel";
import type { Collection, CollectionItem } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import Link from "metabase/core/components/Link";
import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import type { useSearchListQuery } from "metabase/common/hooks";

import { ANALYTICS_CONTEXT } from "metabase/browse/constants";

import NoResults from "assets/img/no_results.svg";
import { Icon, Text } from "metabase/ui";
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

  const { cells } = gridOptions;

  return cells ? (
    <GridContainer>{cells}</GridContainer>
  ) : (
    <CenteredEmptyState
      title={t`No models here yet`}
      message={t`Models help curate data to make it easier to find answers to questions all in one place.`}
      illustrationElement={<img src={NoResults} />}
    />
  );
};

interface ModelCellProps {
  model: Model;
  style?: React.CSSProperties;
}

const ModelCell = ({ model, style }: ModelCellProps) => {
  const modelWithHistory = addLastEditInfo(model);
  const lastEdit = modelWithHistory["last-edit-info"];
  const lastEditorName = lastEdit.full_name;
  const howLongAgo = getHowLongAgo(lastEdit.timestamp);

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

const getGridOptions = (models: Model[]) => {
  const sortedModels = models.sort(sortModels);
  const cells = makeCells(sortedModels);
  return { cells };
};

const addLastEditInfo = (model: Model): CollectionItemWithLastEditInfo => ({
  ...model,
  "last-edit-info": {
    full_name: model.last_editor_common_name ?? model.creator_common_name,
    timestamp: model.last_edited_at ?? model.created_at ?? "",
  },
});
