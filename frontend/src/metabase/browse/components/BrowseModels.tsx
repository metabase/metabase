import _ from "underscore";
import cx from "classnames";
import { t } from "ttag";
import dayjs from "dayjs";
import updateLocale from "dayjs/plugin/updateLocale";
import relativeTime from "dayjs/plugin/relativeTime";

import type { Card, Collection, SearchResult } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import Link from "metabase/core/components/Link";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import type { useSearchListQuery } from "metabase/common/hooks";

import { Box, Group, Icon, Text, Title } from "metabase/ui";
import { sortModels } from "metabase/browse/utils";
import NoResults from "assets/img/no_results.svg";
import { useSelector } from "metabase/lib/redux";
import { getLocale } from "metabase/setup/selectors";
import { CenteredEmptyState } from "./BrowseApp.styled";
import {
  CollectionHeaderContainer,
  CollectionHeaderLink,
  GridContainer,
  ModelCard,
  MultilineEllipsified,
} from "./BrowseModels.styled";
import { LastEdited } from "./LastEdited";

dayjs.extend(updateLocale);
dayjs.extend(relativeTime);

const emptyArray: SearchResult[] = [];

export const groupModels = (
  models: SearchResult[],
  locale: string | undefined,
) => {
  const groupedModels = _.groupBy(models, model => model.collection.id);
  let collections = models.map(model => model.collection);
  collections = _.uniq(collections, collection => collection.id) || [];
  collections.sort((a, b) => a.name.localeCompare(b.name, locale));
  return { groupedModels, collections };
};

export const BrowseModels = ({
  modelsResult,
}: {
  modelsResult: ReturnType<typeof useSearchListQuery<SearchResult>>;
}) => {
  const { data: models = emptyArray, error, isLoading } = modelsResult;
  const locale = useSelector(getLocale);
  const { collections, groupedModels } = groupModels(models, locale?.code);

  if (error || isLoading) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  if (models.length) {
    return (
      <GridContainer role="grid">
        {collections.map((collection, index) => (
          <ModelGroup
            index={index}
            models={groupedModels[collection.id]}
            key={`modelgroup-${index}`}
          />
        ))}
      </GridContainer>
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

const ModelGroup = ({
  models,
  index,
}: {
  models: SearchResult[];
  index: number;
}) => {
  const sortedModels = models.sort(sortModels);
  const collection = models[0].collection;

  /** This id is used by aria-labelledby */
  const collectionHtmlId = `collection-${collection?.id ?? `index-${index}`}`;

  return (
    <>
      <CollectionHeader
        collection={models[0].collection}
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
  style?: React.CSSProperties;
  collectionHtmlId: string;
}

const ModelCell = ({ model, style, collectionHtmlId }: ModelCellProps) => {
  const headingId = `heading-for-model-${model.id}`;

  const lastEditorFullName =
    model.last_editor_common_name ?? model.creator_common_name;
  const timestamp = model.last_edited_at ?? model.created_at ?? "";

  return (
    <Link
      aria-labelledby={`${collectionHtmlId} ${headingId}`}
      key={model.id}
      style={style}
      to={Urls.model(model as unknown as Partial<Card>)}
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
            className={cx({ "text-light": !model.description })}
          >
            {model.description || "No description."}{" "}
          </MultilineEllipsified>
        </Text>
        <LastEdited
          lastEditorFullName={lastEditorFullName}
          timestamp={timestamp}
        />
      </ModelCard>
    </Link>
  );
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
        <CollectionHeaderLink to={Urls.collection(collection)}>
          {children}
        </CollectionHeaderLink>
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
