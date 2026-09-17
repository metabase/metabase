import { useMemo } from "react";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
} from "metabase/api";
import { NavbarPromoSlot } from "metabase/nav/components/NavbarPromoSlot";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";

import { NavRoot, Sidebar } from "./MainNavbar.styled";
import MainNavbarContainer from "./MainNavbarContainer";
import {
  getSelectedItems,
  isCollectionPath,
  isMetricPath,
  isModelPath,
  isQuestionPath,
} from "./getSelectedItems";
import type { MainNavbarOwnProps, SelectedItem } from "./types";

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
