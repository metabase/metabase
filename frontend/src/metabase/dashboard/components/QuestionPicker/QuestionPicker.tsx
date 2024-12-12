import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { isPublicCollection } from "metabase/collections/utils";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import SelectList from "metabase/components/SelectList";
import type { BaseSelectListItemProps } from "metabase/components/SelectList/BaseSelectListItem";
import { getDashboard } from "metabase/dashboard/selectors";
import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { getCrumbs } from "metabase/lib/collections";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { connect, useSelector, useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Button, Flex, Icon, type IconProps } from "metabase/ui";
import type { Collection, CollectionId } from "metabase-types/api";

import { QuestionList } from "./QuestionList";
import {
  BreadcrumbsWrapper,
  QuestionPickerRoot,
  SearchInput,
} from "./QuestionPicker.styled";

interface QuestionPickerInnerProps {
  onSelect: BaseSelectListItemProps["onSelect"];
  collectionsById: Record<CollectionId, Collection>;
  getCollectionIcon: (collection: Collection) => IconProps;
}

// TODO: make sure that user has native query permissions before showing the native query permissions button

function QuestionPickerInner({
  onSelect,
  collectionsById,
  getCollectionIcon,
}: QuestionPickerInnerProps) {
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboard);
  const dashboardCollection = dashboard?.collection ?? ROOT_COLLECTION;
  const [currentCollectionId, setCurrentCollectionId] = useState<CollectionId>(
    dashboardCollection.id,
  );
  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebouncedValue(
    searchText,
    SEARCH_DEBOUNCE_DURATION,
  );

  const collection = collectionsById[currentCollectionId];
  const crumbs = getCrumbs(collection, collectionsById, setCurrentCollectionId);

  const handleSearchTextChange: React.ChangeEventHandler<
    HTMLInputElement
  > = e => setSearchText(e.target.value);

  const allCollections = (collection && collection.children) || [];
  const showOnlyPublicCollections = isPublicCollection(dashboardCollection);
  const collections = showOnlyPublicCollections
    ? allCollections.filter(isPublicCollection)
    : allCollections;

  const onNewQuestion = (type: "native" | "notebook") => {
    const newQuestionParams =
      type === "notebook"
        ? ({
            mode: "notebook",
            creationType: "custom_question",
          } as const)
        : ({
            mode: "query",
            type: "native",
            creationType: "native_question",
          } as const);

    if (dashboard) {
      dispatch(
        push(
          Urls.newQuestion({
            ...newQuestionParams,
            collectionId: dashboard.collection_id || undefined,
            cardType: "question",
            dashboardId: dashboard.id,
          }),
        ),
      );
    }
  };

  return (
    <QuestionPickerRoot>
      <SearchInput
        fullWidth
        autoFocus
        data-autofocus
        placeholder={t`Search…`}
        value={searchText}
        onResetClick={() => setSearchText("")}
        onChange={handleSearchTextChange}
      />

      <Flex gap="sm" mb="md">
        <Button
          color="text-dark"
          variant="outline"
          leftIcon={<Icon name="insight" />}
          onClick={() => onNewQuestion("notebook")}
          style={{ borderColor: "#F0F0F0" }}
          w="100%"
        >
          {t`New Question`}
        </Button>
        <Button
          color="text-dark"
          variant="outline"
          leftIcon={<Icon name="sql" />}
          onClick={() => onNewQuestion("native")}
          style={{ borderColor: "#F0F0F0" }}
          w="100%"
        >
          {t`New SQL query`}
        </Button>
      </Flex>

      {!debouncedSearchText && (
        <>
          <BreadcrumbsWrapper>
            <Breadcrumbs crumbs={crumbs} />
          </BreadcrumbsWrapper>

          {collections.length > 0 && (
            <SelectList>
              {collections.map(collection => {
                const icon = getCollectionIcon(collection);
                const iconColor = PLUGIN_COLLECTIONS.isRegularCollection(
                  collection,
                )
                  ? "text-light"
                  : icon.color;
                return (
                  <SelectList.Item
                    key={collection.id}
                    id={collection.id}
                    name={collection.name}
                    icon={{
                      ...icon,
                      color: iconColor,
                    }}
                    rightIcon="chevronright"
                    onSelect={collectionId =>
                      setCurrentCollectionId(collectionId as CollectionId)
                    }
                  />
                );
              })}
            </SelectList>
          )}
        </>
      )}

      <QuestionList
        hasCollections={collections.length > 0}
        searchText={debouncedSearchText}
        collectionId={currentCollectionId}
        onSelect={onSelect}
        showOnlyPublicCollections={showOnlyPublicCollections}
      />
    </QuestionPickerRoot>
  );
}

// TODO: remove entity usage
export const QuestionPicker = _.compose(
  Collections.load({
    id: () => "root",
    entityType: "collections",
    loadingAndErrorWrapper: false,
  }),
  Collections.loadList({
    entityType: "collections",
    loadingAndErrorWrapper: false,
  }),
  connect((state, props) => ({
    collectionsById: (
      (props as any).entity || Collections
    ).selectors.getExpandedCollectionsById(state),
    getCollectionIcon: ((props as any).entity || Collections).objectSelectors
      .getIcon,
  })),
)(QuestionPickerInner);
