import _ from "underscore";
import { t } from "ttag";

import type {
  Card,
  CollectionEssentials,
  SearchResult,
} from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import Link from "metabase/core/components/Link";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Search from "metabase/entities/search";
import { useDispatch, useSelector } from "metabase/lib/redux";

import type { useSearchListQuery } from "metabase/common/hooks";

import { Box, Group, Icon, Text, Title } from "metabase/ui";
import NoResults from "assets/img/no_results.svg";

import { getLocale } from "metabase/setup/selectors";
import { isInstanceAnalyticsCollection } from "metabase/collections/utils";

import { color } from "metabase/lib/colors";
import { getCollectionName, groupModels } from "../utils";
import { getFiltersForBrowseModels } from "../selectors";
import { CenteredEmptyState } from "./BrowseApp.styled";
import {
  CollectionHeaderContainer,
  CollectionHeaderGroup,
  CollectionHeaderLink,
  GridContainer,
  ModelCard,
  MultilineEllipsified,
} from "./BrowseModels.styled";
import { LastEdited } from "./LastEdited";
import { ModelExplanationBanner } from "./ModelExplanationBanner";

type Filter = {
  filterFunction: (model: SearchResult) => boolean;
};

/** Filters that may or may not currently be applied */
const filters: Record<string, Filter> = {
  onlyShowVerifiedModels: {
    filterFunction: (model: SearchResult) =>
      model.moderated_status === "verified",
  },
  hideCSVModels: {
    // TODO: Find a way to filter out csv uploads
    filterFunction: (_model: SearchResult) => model.uploaded_via_csv === false,
  },
  removeInstanceAnalyticsCollection: {
    filterFunction: (model: SearchResult) =>
      !isInstanceAnalyticsCollection(model.collection),
  },
};

// TODO: Make this work
type Filters = {
  [K in keyof typeof filters]: boolean;
};

const defaultFilters: Filters = {
  onlyShowVerifiedModels: true,
  hideCSVModels: true,
  removeInstanceAnalyticsCollection: true,
};

export const BrowseModels = ({
  modelsResult,
}: {
  modelsResult: ReturnType<typeof useSearchListQuery<SearchResult>>;
}) => {
  const { data: models = [], error, isLoading } = modelsResult;
  const locale = useSelector(getLocale);
  const localeCode: string | undefined = locale?.code;
  const filtersJSON = useSelector(getFiltersForBrowseModels);

  const setFiltersForBrowseModels = (filters: Record<string, boolean>) => {
    dispatch(
      updateSetting({
        key: "browse-models-filters",
        value: JSON.stringify(filters),
      }),
    );
  };

  let filtersFromAPI = {};
  try {
    filtersFromAPI = JSON.parse(filtersJSON || "{}");
  } catch (e) {
    if (e instanceof SyntaxError) {
      setFiltersForBrowseModels(defaultFilters);
    }
  }

  const activeFilters = { ...defaultFilters, ...filtersFromAPI };
  const modelsFiltered = _.reduce(
    activeFilters,
    (acc, apply, filterName) => {
      return apply ? acc.filter(filters[filterName].filterFunction) : acc;
    },
    models,
  );
  const groupsOfModels = groupModels(modelsFiltered, localeCode);

  if (error || isLoading) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  if (modelsFiltered.length) {
    return (
      <>
        <ModelExplanationBanner />
        <GridContainer role="grid">
          {groupsOfModels.map(groupOfModels => (
            <ModelGroup
              models={groupOfModels}
              key={`modelgroup-${groupOfModels[0].collection.id}`}
              localeCode={localeCode}
            />
          ))}
        </GridContainer>
      </>
    );
  }

  return (
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

const isVerified = (model: SearchResult) =>
  model.moderated_status === "verified";

const ModelGroup = ({
  models,
  localeCode,
}: {
  models: SearchResult[];
  localeCode: string | undefined;
}) => {
  const sortedModels = models.sort((a, b) => {
    const aVerified = isVerified(a);
    const bVerified = isVerified(b);

    // Sort verified models first
    if (aVerified && !bVerified) {
      return -1;
    }
    if (!aVerified && bVerified) {
      return 1;
    }

    if (a.name && !b.name) {
      return -1;
    }
    if (!a.name && !b.name) {
      return 0;
    }
    if (!a.name && b.name) {
      return 1;
    }
    if (a.name && !b.name) {
      return -1;
    }
    if (!a.name && !b.name) {
      return 0;
    }
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    return nameA.localeCompare(nameB, localeCode);
  });
  const collection = models[0].collection;

  /** This id is used by aria-labelledby */
  const collectionHtmlId = `collection-${collection.id}`;

  // TODO: Check padding above the collection header
  return (
    <>
      <CollectionHeader
        collection={collection}
        key={collectionHtmlId}
        id={collectionHtmlId}
      />
      {sortedModels.map(model => (
        <ModelCell
          model={model}
          collectionHtmlId={collectionHtmlId}
          key={`model-${model.id}`}
        />
      ))}
    </>
  );
};

interface ModelCellProps {
  model: SearchResult;
  collectionHtmlId: string;
}

const ModelCell = ({ model, collectionHtmlId }: ModelCellProps) => {
  const headingId = `heading-for-model-${model.id}`;

  const lastEditorFullName =
    model.last_editor_common_name ?? model.creator_common_name;
  const timestamp = model.last_edited_at ?? model.created_at ?? "";

  return (
    <Link
      aria-labelledby={`${collectionHtmlId} ${headingId}`}
      key={model.id}
      to={Urls.model(model as unknown as Partial<Card>)}
    >
      <ModelCard>
        <Box mb="auto">
          <Icon name="model" size={20} color={color("brand")} />
          {model.moderated_status === "verified" ? (
            <div>
              {/* TODO: Implement an icon stack */}
              <Icon name="model" size={20} className="text-brand" />
              <Icon name="verified_filled" size={10} className="text-brand" />
            </div>
          ) : (
            <Icon name="model" size={20} className="text-brand" />
          )}
        </Box>
        <Title mb=".25rem" size="1rem">
          <MultilineEllipsified tooltipMaxWidth="20rem" id={headingId}>
            {model.name}
          </MultilineEllipsified>
        </Title>
        <LastEdited editorFullName={lastEditorFullName} timestamp={timestamp} />
      </ModelCard>
    </Link>
  );
};

const CollectionHeader = ({
  collection,
  id,
}: {
  collection: CollectionEssentials;
  id: string;
}) => {
  const dispatch = useDispatch();
  const wrappable = { ...collection, model: "collection" };
  const wrappedCollection = Search.wrapEntity(wrappable, dispatch);
  const icon = wrappedCollection.getIcon();

  return (
    <CollectionHeaderContainer
      id={id}
      role="heading"
      pt={"1rem"}
      mr="1rem"
      align="center"
    >
      <CollectionHeaderGroup grow noWrap>
        <CollectionHeaderLink to={Urls.collection(collection)}>
          <Group spacing=".25rem">
            <Icon {...icon} />
            <Text weight="bold" color="text-dark">
              {getCollectionName(collection)}
            </Text>
          </Group>
        </CollectionHeaderLink>
      </CollectionHeaderGroup>
    </CollectionHeaderContainer>
  );
};
