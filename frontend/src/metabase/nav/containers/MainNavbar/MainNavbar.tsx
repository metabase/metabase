import type { LocationDescriptor } from "history";
import { useEffect, useMemo } from "react";
import { push } from "react-router-redux";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
} from "metabase/api";
import { NavbarPromoSlot } from "metabase/nav/components/NavbarPromoSlot";
import { connect } from "metabase/redux";
import { closeNavbar, openNavbar } from "metabase/redux/app";
import type { State } from "metabase/redux/store";
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
import type {
  MainNavbarDispatchProps,
  MainNavbarOwnProps,
  SelectedItem,
} from "./types";

interface EntityLoaderProps {
  question?: Question;
}

interface StateProps {
  questionId?: number | null;
  collectionId?: CollectionId | null;
}

interface DispatchProps extends MainNavbarDispatchProps {
  onChangeLocation: (location: LocationDescriptor) => void;
}

type Props = MainNavbarOwnProps &
  EntityLoaderProps &
  StateProps &
  DispatchProps;

function mapStateToProps(state: State, props: MainNavbarOwnProps) {
  return {
    questionId: maybeGetQuestionId(state, props),
    collectionId: maybeGetCollectionId(state, props),
  };
}

const mapDispatchToProps = {
  openNavbar,
  closeNavbar,
  onChangeLocation: push,
};

function MainNavbarInner({
  isOpen,
  location,
  params,
  questionId,
  collectionId,
  dashboard,
  openNavbar,
  closeNavbar,
  onChangeLocation,
  ...props
}: Props) {
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

  useEffect(() => {
    function handleSidebarKeyboardShortcut(e: KeyboardEvent) {
      if (e.key === "." && (e.ctrlKey || e.metaKey)) {
        if (isOpen) {
          closeNavbar();
        } else {
          openNavbar();
        }
      }
    }

    window.addEventListener("keydown", handleSidebarKeyboardShortcut);
    return () => {
      window.removeEventListener("keydown", handleSidebarKeyboardShortcut);
    };
  }, [isOpen, openNavbar, closeNavbar]);

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
      isOpen={isOpen}
      side="left"
      aria-hidden={!isOpen}
      data-testid="main-navbar-root"
      data-element-id="navbar-root"
    >
      <NavRoot isOpen={isOpen}>
        <MainNavbarContainer
          isOpen={isOpen}
          location={location}
          params={params}
          selectedItems={selectedItems}
          openNavbar={openNavbar}
          closeNavbar={closeNavbar}
          onChangeLocation={onChangeLocation}
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

export const MainNavbar = connect(
  mapStateToProps,
  mapDispatchToProps,
)(MainNavbarInner);
