import { useEffect, useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
  useGetTableQuery,
} from "metabase/api";
import { deserializeCardFromUrl } from "metabase/common/utils/card";
import { getStartedConversations } from "metabase/metabot/state";
import { NavbarPromoSlot } from "metabase/nav/components/NavbarPromoSlot";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { connect, useDispatch, useSelector } from "metabase/redux";
import { openNavItem, setNavSectionSeed } from "metabase/redux/app";
import type { State } from "metabase/redux/store";
import type { Location } from "metabase/router";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import Question from "metabase-lib/v1/Question";
import type { Collection, CollectionId, TableId } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { NavRoot, Sidebar } from "./MainNavbar.styled";
import MainNavbarContainer from "./MainNavbarContainer";
import {
  getSelectedItems,
  isCollectionPath,
  isMetricPath,
  isModelPath,
  isQuestionPath,
} from "./getSelectedItems";
import { getOpenNavItem } from "./open-nav-item";
import type { MainNavbarOwnProps, NavSection, SelectedItem } from "./types";

interface EntityLoaderProps {
  question?: Question;
}

interface StateProps {
  questionId?: number | null;
  collectionId?: CollectionId | null;
}

type Props = MainNavbarOwnProps & EntityLoaderProps & StateProps;

function mapStateToProps(state: State, props: MainNavbarOwnProps) {
  return {
    questionId: maybeGetQuestionId(state, props),
    collectionId: maybeGetCollectionId(state, props),
  };
}

function MainNavbarInner({
  location,
  params,
  questionId,
  collectionId,
  dashboard,
  ...props
}: Props) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentData: card } = useGetCardQuery(
    questionId
      ? {
          id: questionId,
        }
      : skipToken,
  );

  const adHocTableId = useMemo(
    () => maybeGetAdHocTableId(location),
    [location],
  );
  const { currentData: table } = useGetTableQuery(
    adHocTableId != null ? { id: adHocTableId } : skipToken,
  );

  const { currentData: collection } = useGetCollectionQuery(
    collectionId ? { id: collectionId } : skipToken,
  );

  const selectedItems = useMemo<SelectedItem[]>(() => {
    const question = card && new Question(card);

    return getSelectedItems({
      pathname: location.pathname,
      params,
      question,
      collection,
      dashboard,
      table: table?.is_published ? table : undefined,
    });
  }, [location, params, card, dashboard, collection, table]);

  const openItem = useMemo(
    () => getOpenNavItem({ pathname: location.pathname, card, dashboard }),
    [location.pathname, card, dashboard],
  );

  // Which rail the thing on screen belongs to. Without this a reload of an official metric would
  // fall back to the URL, which says nothing about authority, and land on Unofficial.
  const navSectionSeed = getNavSectionSeed(
    card?.collection ?? table?.collection ?? collection,
  );

  useEffect(() => {
    dispatch(setNavSectionSeed(navSectionSeed));
  }, [dispatch, navSectionSeed]);

  useEffect(() => {
    if (openItem) {
      dispatch(openNavItem(openItem));
    }
  }, [dispatch, openItem]);

  const conversations = useSelector(getStartedConversations);

  useEffect(() => {
    conversations.forEach((conversation) => {
      dispatch(
        openNavItem({
          key: `metabot-${conversation.conversationId}`,
          // The title is generated after the first answer, so the row starts generic and renames.
          name: conversation.title ?? t`New conversation`,
          url: Urls.metabotConversation(conversation.conversationId),
          icon: "metabot",
        }),
      );
    });
  }, [dispatch, conversations]);

  return (
    <Sidebar
      side="left"
      data-testid="main-navbar-root"
      data-element-id="navbar-root"
    >
      <NavRoot>
        <MainNavbarContainer
          location={location}
          params={params}
          selectedItems={selectedItems}
          onChangeLocation={navigate}
          {...props}
        />
        <NavbarPromoSlot />
      </NavRoot>
    </Sidebar>
  );
}

function getNavSectionSeed(
  collection: Collection | null | undefined,
): NavSection | null {
  if (!collection) {
    return null;
  }
  const isOfficial =
    collection.authority_level === "official" ||
    PLUGIN_LIBRARY.isLibraryCollectionType(collection.type);

  return isOfficial ? "official" : "unofficial";
}

/**
 * A published table has no page of its own: the rail links it as an ad-hoc question, so the table
 * it reads has to come back out of the serialized card in the URL hash.
 */
function maybeGetAdHocTableId(location: Location): TableId | null {
  if (!isQuestionPath(location.pathname) || !location.hash) {
    return null;
  }

  try {
    const card = deserializeCardFromUrl(location.hash.replace(/^#/, ""));
    if (card.id != null) {
      return null;
    }
    return getSourceTableId(card.dataset_query);
  } catch {
    // A hash the QB understands but we do not is not worth breaking the rail over.
    return null;
  }
}

/** The hash is user-controlled, so the shape is checked rather than asserted. */
function getSourceTableId(datasetQuery: unknown): TableId | null {
  if (!isObject(datasetQuery) || datasetQuery.type !== "query") {
    return null;
  }

  const { query } = datasetQuery;
  if (!isObject(query)) {
    return null;
  }

  const sourceTable = query["source-table"];
  return typeof sourceTable === "number" ? sourceTable : null;
}

function maybeGetQuestionId(
  state: State,
  { location, params }: MainNavbarOwnProps,
) {
  const { pathname } = location;

  // The metric routes name their param `cardId`; question and model routes use a `slug`.
  if (isMetricPath(pathname)) {
    return Urls.extractEntityId(params.cardId);
  }

  return isQuestionPath(pathname) || isModelPath(pathname)
    ? Urls.extractEntityId(params.slug)
    : null;
}

function maybeGetCollectionId(
  state: State,
  { location, params }: MainNavbarOwnProps,
) {
  const { pathname } = location;
  const canFetchQuestion = isCollectionPath(pathname);
  return canFetchQuestion ? Urls.extractEntityId(params.slug) : null;
}

export const MainNavbar = connect(mapStateToProps)(MainNavbarInner);
