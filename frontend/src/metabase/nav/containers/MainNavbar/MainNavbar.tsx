import { useEffect, useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
} from "metabase/api";
import { getStartedConversations } from "metabase/metabot/state";
import { NavbarPromoSlot } from "metabase/nav/components/NavbarPromoSlot";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { connect, useDispatch, useSelector } from "metabase/redux";
import { openNavItem, setNavSectionSeed } from "metabase/redux/app";
import type { State } from "metabase/redux/store";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import Question from "metabase-lib/v1/Question";
import type { Collection, CollectionId } from "metabase-types/api";

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
    });
  }, [location, params, card, dashboard, collection]);

  const openItem = useMemo(
    () => getOpenNavItem({ pathname: location.pathname, card, dashboard }),
    [location.pathname, card, dashboard],
  );

  // Which rail the thing on screen belongs to. Without this a reload of an official metric would
  // fall back to the URL, which says nothing about authority, and land on Unofficial.
  const navSectionSeed = getNavSectionSeed(card?.collection ?? collection);

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

function maybeGetQuestionId(
  state: State,
  { location, params }: MainNavbarOwnProps,
) {
  const { pathname } = location;
  const canFetchQuestion =
    isQuestionPath(pathname) || isModelPath(pathname) || isMetricPath(pathname);
  return canFetchQuestion ? Urls.extractEntityId(params.slug) : null;
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
