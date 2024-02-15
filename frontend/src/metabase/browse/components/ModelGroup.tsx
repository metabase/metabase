import { c } from "ttag";
import { useDisclosure } from "@mantine/hooks";
import type { Card, SearchResult } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import { getCollectionName, sortModels } from "../utils";

import {
  CollectionCollapse,
  CollectionExpandCollapseContainer,
  CollectionHeaderContainer,
  CollectionHeaderToggle,
  ContainerExpandCollapseButton,
  ModelCard,
  MultilineEllipsified,
} from "./BrowseModels.styled";
import { LastEdited } from "./LastEdited";

export const ModelGroup = ({
  models,
  localeCode,
}: {
  models: SearchResult[];
  localeCode: string | undefined;
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
        <Group spacing=".25rem">
          <CollectionHeaderToggle
            styles={noTransform}
            onClick={toggleSomeModelsShown}
          >
            <Icon name={areSomeModelsShown ? "chevrondown" : "chevronright"} />
          </CollectionHeaderToggle>
          <Icon {...icon} />
          <Text weight="bold" color="text-dark">
            {getCollectionName(collection)}
          </Text>
        </Group>
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
    <Link
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
    </Link>
  );
};

const noTransform = {
  root: {
    top: 0,
    transform: "none",
    ":active": { transform: "none" },
  },
};
