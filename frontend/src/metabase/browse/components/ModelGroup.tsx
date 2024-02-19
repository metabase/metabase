import { c, msgid } from "ttag";
import { useMemo } from "react";
import type {
  Card,
  SearchResult,
  CollectionEssentials,
} from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import { Box, Icon, Title } from "metabase/ui";

import { color } from "metabase/lib/colors";
import { getCollectionName, sortModels, getIcon } from "../utils";
import {
  CollectionCollapse,
  CollectionExpandCollapseContainer,
  CollectionHeaderDiv,
  CollectionHeaderContainer,
  CollectionHeaderLink,
  CollectionHeaderToggle,
  CollectionSummary,
  ContainerExpandCollapseButton,
  FixedSizeIcon,
  ModelCard,
  ModelCardLink,
  MultilineEllipsified,
} from "./BrowseModels.styled";

const MAX_COLLAPSED_MODELS = 6;

export const ModelGroup = ({
  models,
  localeCode,
  expanded,
  showAll,
  toggleExpanded,
  toggleShowAll,
}: {
  models: SearchResult[];
  localeCode: string | undefined;
  expanded: boolean;
  showAll: boolean;
  toggleExpanded: () => void;
  toggleShowAll: () => void;
}) => {
  const { aboveFoldModels, belowFoldModels } = useMemo(() => {
    const sortedModels = models.sort((a, b) => sortModels(a, b, localeCode));

    return {
      aboveFoldModels: sortedModels.slice(0, MAX_COLLAPSED_MODELS),
      belowFoldModels: sortedModels.slice(MAX_COLLAPSED_MODELS),
    };
  }, [models, localeCode]);

  const visibleModels = showAll
    ? [...aboveFoldModels, ...belowFoldModels]
    : aboveFoldModels;
  const collection = models[0].collection;

  /** This id is used by aria-labelledby */
  const collectionHtmlId = `collection-${collection.id}`;

  return (
    <>
      <CollectionHeader
        collection={collection}
        onClick={toggleExpanded}
        expanded={expanded}
        modelsCount={models.length}
      />
      <CollectionCollapse in={expanded} transitionDuration={0}>
        {visibleModels.map(model => (
          <ModelCell
            model={model}
            collectionHtmlId={collectionHtmlId}
            key={`model-${model.id}`}
          />
        ))}
        <ShowMoreFooter
          hasMoreModels={models.length > MAX_COLLAPSED_MODELS}
          shownModelsCount={aboveFoldModels.length}
          allModelsCount={models.length}
          showAll={showAll}
          onClick={toggleShowAll}
        />
      </CollectionCollapse>
    </>
  );
};

const CollectionHeader = ({
  collection,
  onClick,
  expanded,
  modelsCount,
}: {
  collection: CollectionEssentials;
  onClick: () => void;
  expanded: boolean;
  modelsCount: number;
}) => {
  const icon = getIcon({ ...collection, model: "collection" });
  const collectionHtmlId = `collection-${collection.id}`;

  return (
    <CollectionHeaderContainer id={collectionHtmlId} role="heading">
      <CollectionHeaderToggle styles={noTransform} onClick={onClick}>
        <FixedSizeIcon
          color={color("text-medium")}
          name={expanded ? "chevrondown" : "chevronright"}
        />
      </CollectionHeaderToggle>
      <CollectionHeaderDiv>
        <CollectionHeaderLink to={Urls.collection(collection)}>
          <FixedSizeIcon {...icon} />
          <Title size="1rem" lh="1rem" ml=".25rem" mr="1rem" color="inherit">
            {getCollectionName(collection)}
          </Title>
        </CollectionHeaderLink>
        <CollectionSummary>
          {c("{0} is the number of models in a collection").ngettext(
            msgid`${modelsCount} model`,
            `${modelsCount} models`,
            modelsCount,
          )}
        </CollectionSummary>
      </CollectionHeaderDiv>
    </CollectionHeaderContainer>
  );
};

const ShowMoreFooter = ({
  hasMoreModels,
  shownModelsCount,
  allModelsCount,
  onClick,
  showAll,
}: {
  hasMoreModels: boolean;
  shownModelsCount: number;
  allModelsCount: number;
  showAll: boolean;
  onClick: () => void;
}) => {
  if (!hasMoreModels) {
    return null;
  }

  return (
    <CollectionExpandCollapseContainer>
      {!showAll && `${shownModelsCount} of ${allModelsCount}`}
      <ContainerExpandCollapseButton
        styles={noTransform}
        lh="inherit"
        p="0"
        onClick={onClick}
      >
        {showAll
          ? c("For a button that collapses a list of models").t`Show less`
          : c("For a button that expands a list of models").t`Show all`}
      </ContainerExpandCollapseButton>
    </CollectionExpandCollapseContainer>
  );
};

interface ModelCellProps {
  model: SearchResult;
  collectionHtmlId: string;
}

const ModelCell = ({ model, collectionHtmlId }: ModelCellProps) => {
  const headingId = `heading-for-model-${model.id}`;

  return (
    <ModelCardLink
      aria-labelledby={`${collectionHtmlId} ${headingId}`}
      key={model.id}
      to={Urls.model(model as unknown as Partial<Card>)}
    >
      <ModelCard>
        <Box mb="auto">
          <Icon name="model" size={20} color={color("brand")} />
        </Box>
        <Title mb=".25rem" size="1rem">
          <MultilineEllipsified tooltipMaxWidth="20rem" id={headingId}>
            {model.name}
          </MultilineEllipsified>
        </Title>
        <MultilineEllipsified tooltipMaxWidth="20rem">
          {model.description}
        </MultilineEllipsified>
      </ModelCard>
    </ModelCardLink>
  );
};

const noTransform = {
  root: {
    top: 0,
    transform: "none",
    ":active": { transform: "none" },
  },
};
