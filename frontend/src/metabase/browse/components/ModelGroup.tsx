import { useMemo } from "react";
import { c, msgid, t } from "ttag";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Box, Button, Flex, Icon, Text, Title } from "metabase/ui";
import type {
  Card,
  CollectionEssentials,
  SearchResult,
} from "metabase-types/api";

import { trackModelClick } from "../analytics";
import { getCollectionName, getIcon, sortModels } from "../utils";

import {
  CollectionCollapse,
  CollectionExpandCollapseContainer,
  CollectionHeaderContainer,
  CollectionHeaderToggleContainer,
  CollectionSummary,
  FixedSizeIcon,
  HoverUnderlineLink,
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
  const { sortedModels, aboveFoldModelsCount } = useMemo(() => {
    const sortedModels = [...models].sort((a, b) =>
      sortModels(a, b, localeCode),
    );

    const aboveFoldModelsCount =
      models.length >= MAX_COLLAPSED_MODELS
        ? MAX_COLLAPSED_MODELS
        : models.length;

    return { sortedModels, aboveFoldModelsCount };
  }, [models, localeCode]);

  const visibleModels = useMemo(() => {
    return showAll ? sortedModels : sortedModels.slice(0, MAX_COLLAPSED_MODELS);
  }, [sortedModels, showAll]);

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
          shownModelsCount={aboveFoldModelsCount}
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
    <CollectionHeaderContainer
      id={collectionHtmlId}
      role="heading"
      onClick={onClick}
    >
      <CollectionHeaderToggleContainer>
        <FixedSizeIcon
          aria-label={
            expanded
              ? t`collapse ${getCollectionName(collection)}`
              : t`expand ${getCollectionName(collection)}`
          }
          name={expanded ? "chevrondown" : "chevronright"}
        />
      </CollectionHeaderToggleContainer>
      <Flex pt="1.5rem" pb="0.75rem" w="100%">
        <Flex>
          <FixedSizeIcon {...icon} />
          <Title
            size="1rem"
            lh="1rem"
            style={{
              marginInlineStart: ".25rem",
              marginInlineEnd: "1rem",
            }}
            color="inherit"
          >
            {getCollectionName(collection)}
          </Title>
        </Flex>
        <CollectionSummary>
          <HoverUnderlineLink
            to={Urls.collection(collection)}
            onClick={e => e.stopPropagation() /* prevent collapse */}
          >
            {c("{0} is the number of models in a collection").ngettext(
              msgid`${modelsCount} model`,
              `${modelsCount} models`,
              modelsCount,
            )}
          </HoverUnderlineLink>
        </CollectionSummary>
      </Flex>
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
      <Button variant="subtle" lh="inherit" p="0" onClick={onClick}>
        {showAll
          ? c("This text appears on a button that collapses a list of models")
              .t`Show less`
          : c("This text appears on a button that expands a list of models")
              .t`Show all`}
      </Button>
    </CollectionExpandCollapseContainer>
  );
};

interface ModelCellProps {
  model: SearchResult;
  collectionHtmlId: string;
}

const ModelCell = ({ model, collectionHtmlId }: ModelCellProps) => {
  const headingId = `heading-for-model-${model.id}`;

  const icon = getIcon(model);

  return (
    <ModelCardLink
      aria-labelledby={`${collectionHtmlId} ${headingId}`}
      key={model.id}
      to={Urls.model(model as unknown as Partial<Card>)}
      onClick={() => trackModelClick(model.id)}
    >
      <ModelCard>
        <Box mb="auto">
          <Icon {...icon} size={20} color={color("brand")} />
        </Box>
        <Title mb=".25rem" size="1rem">
          <MultilineEllipsified tooltipMaxWidth="20rem" id={headingId}>
            {model.name}
          </MultilineEllipsified>
        </Title>
        {model.description?.trim() ? (
          <MultilineEllipsified tooltipMaxWidth="20rem">
            {model.description}
          </MultilineEllipsified>
        ) : (
          <Text color="text-light">{t`No description.`}</Text>
        )}
      </ModelCard>
    </ModelCardLink>
  );
};
