import { useDisclosure } from "@mantine/hooks";
import { c, msgid } from "ttag";
import type { Card, SearchResult } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import Search from "metabase/entities/search";
import { useDispatch } from "metabase/lib/redux";

import { Box, Icon, Title } from "metabase/ui";

import { color } from "metabase/lib/colors";
import { getCollectionName, sortModels } from "../utils";

import {
  CollectionCollapse,
  CollectionExpandCollapseContainer,
  CollectionHeader,
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
import { LastEdited } from "./LastEdited";

export const ModelGroup = ({
  models,
  localeCode,
  index,
}: {
  models: SearchResult[];
  localeCode: string | undefined;
  index: number;
}) => {
  const sortedModels = models.sort((a, b) => sortModels(a, b, localeCode));
  const collection = models[0].collection;

  /** This id is used by aria-labelledby */
  const collectionHtmlId = `collection-${collection.id}`;

  const collapsedSize = 6;
  const aboveFold = sortedModels.slice(0, collapsedSize);
  const belowFold = sortedModels.slice(collapsedSize);

  const [areSomeModelsShown, { toggle: toggleSomeModelsShown }] =
    useDisclosure(true);
  const [areAllModelsShown, { toggle: toggleAllModelsShown }] =
    useDisclosure(false);

  const dispatch = useDispatch();
  const wrappable = { ...collection, model: "collection" };
  const wrappedCollection = Search.wrapEntity(wrappable, dispatch);
  const icon = wrappedCollection.getIcon();

  return (
    <>
      <CollectionHeaderContainer id={collectionHtmlId} role="heading">
        <CollectionHeaderToggle
          styles={noTransform}
          onClick={toggleSomeModelsShown}
        >
          <FixedSizeIcon
            color={color("text-medium")}
            name={areSomeModelsShown ? "chevrondown" : "chevronright"}
          />
        </CollectionHeaderToggle>
        <CollectionHeader index={index}>
          <CollectionHeaderLink to={Urls.collection(collection)}>
            <FixedSizeIcon {...icon} />
            <Title size="1rem" lh="1rem" ml=".25rem" mr="1rem" color="inherit">
              {getCollectionName(collection)}
            </Title>
          </CollectionHeaderLink>
          <CollectionSummary>
            {c("{0} is the number of models in a collection").ngettext(
              msgid`${models.length} model`,
              `${models.length} models`,
              models.length,
            )}
          </CollectionSummary>
        </CollectionHeader>
      </CollectionHeaderContainer>
      <CollectionCollapse in={areSomeModelsShown} transitionDuration={0}>
        {aboveFold.map(model => (
          <ModelCell
            model={model}
            collectionHtmlId={collectionHtmlId}
            key={`model-${model.id}`}
          />
        ))}
        {belowFold.length > 0 && (
          <>
            <CollectionCollapse in={areAllModelsShown} transitionDuration={0}>
              {belowFold.map(model => (
                <ModelCell
                  model={model}
                  collectionHtmlId={collectionHtmlId}
                  key={`model-${model.id}`}
                />
              ))}
            </CollectionCollapse>
            <CollectionExpandCollapseContainer>
              {!areAllModelsShown &&
                belowFold.length &&
                `${aboveFold.length} of ${models.length}`}
              {belowFold.length && (
                <ContainerExpandCollapseButton
                  styles={noTransform}
                  lh="inherit"
                  p="0"
                  onClick={toggleAllModelsShown}
                >
                  {areAllModelsShown
                    ? c("For a button that collapses a list of models")
                        .t`Show less`
                    : c("For a button that expands a list of models")
                        .t`Show all`}
                </ContainerExpandCollapseButton>
              )}
            </CollectionExpandCollapseContainer>
          </>
        )}
      </CollectionCollapse>
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
        <LastEdited editorFullName={lastEditorFullName} timestamp={timestamp} />
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
