import { useDisclosure } from "@mantine/hooks";
import { useEffect } from "react";
import { c, msgid } from "ttag";
import type { Card, CollectionId, SearchResult } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";

import Search from "metabase/entities/search";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { Box, Icon, Title } from "metabase/ui";

import { updateSetting } from "metabase/admin/settings/settings";
import { isValidCollectionId } from "metabase/collections/utils";
import { color } from "metabase/lib/colors";
import { getSetting } from "metabase/selectors/settings";
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

type CollectionPrefs = Record<CollectionId, ModelVisibilityPrefs>;

type ModelVisibilityPrefs = {
  areAllModelsShown: boolean;
  areSomeModelsShown: boolean;
};

const isRecordWithCollectionIdKeys = (
  prefs: unknown,
): prefs is Record<CollectionId, any> =>
  typeof prefs === "object" &&
  prefs !== null &&
  Object.keys(prefs).every(key => isValidCollectionId(key));

const isValidModelVisibilityPrefs = (
  value: unknown,
): value is ModelVisibilityPrefs =>
  typeof value === "object" &&
  value !== null &&
  Object.keys(value).includes("areAllModelsShown") &&
  Object.keys(value).includes("areSomeModelsShown") &&
  Object.values(value).every(val => typeof val === "boolean");

const isValidCollectionPrefs = (prefs: unknown): prefs is CollectionPrefs =>
  isRecordWithCollectionIdKeys(prefs) &&
  Object.values(prefs).every(val => isValidModelVisibilityPrefs(val));

const tryToParseCollectionPrefs = (
  json: string | null,
): CollectionPrefs | null => {
  try {
    const parsed = JSON.parse(json || "");
    return isValidCollectionPrefs(parsed) ? parsed : null;
  } catch (e) {
    if (e instanceof SyntaxError) {
      return null;
    }
    throw e;
  }
};

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

  const collectionPrefsAsString = useSelector(state =>
    getSetting(state, "browse-collection-prefs"),
  );
  const initialCollectionPrefs = collectionPrefsAsString
    ? tryToParseCollectionPrefs(collectionPrefsAsString)
    : null;

  /** This id is used by aria-labelledby */
  const collectionHtmlId = `collection-${collection.id}`;

  const collapsedSize = 6;
  const aboveFold = sortedModels.slice(0, collapsedSize);
  const belowFold = sortedModels.slice(collapsedSize);

  const [areSomeModelsShown, { toggle: toggleSomeModelsShown }] = useDisclosure(
    initialCollectionPrefs?.[collection.id]?.areSomeModelsShown,
  );
  const [areAllModelsShown, { toggle: toggleAllModelsShown }] = useDisclosure(
    initialCollectionPrefs?.[collection.id]?.areAllModelsShown,
  );

  const dispatch = useDispatch();

  const newCollectionPrefs = {
    ...initialCollectionPrefs,
    [collection.id]: { areAllModelsShown, areSomeModelsShown },
  };
  const newCollectionPrefsStringified = JSON.stringify(newCollectionPrefs);

  useEffect(() => {
    // FIXME: Can this lead to race conditions? Perhaps a system with Promise.all would make sense?
    dispatch(
      updateSetting({
        key: "browse-collection-prefs",
        value: newCollectionPrefsStringified,
      }),
    );
  }, [dispatch, newCollectionPrefsStringified]);

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
