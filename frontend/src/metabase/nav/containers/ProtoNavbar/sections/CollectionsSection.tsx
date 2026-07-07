import type { Location } from "history";
import { useMemo } from "react";
import { push } from "react-router-redux";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
} from "metabase/api";
import { useDispatch } from "metabase/redux";
import { closeNavbar, openNavbar } from "metabase/redux/app";
import * as Urls from "metabase/urls";
import Question from "metabase-lib/v1/Question";

import MainNavbarContainer from "../../MainNavbar/MainNavbarContainer";
import {
  getSelectedItems,
  isCollectionPath,
  isMetricPath,
  isModelPath,
  isQuestionPath,
} from "../../MainNavbar/getSelectedItems";
import type { SelectedItem } from "../../MainNavbar/types";

type Props = {
  isOpen: boolean;
  location: Location;
  params: { slug?: string; pageId?: string };
};

/**
 * Renders the existing main collections nav (Home, bookmarks, collection
 * tree, browse, trash) verbatim, just hosted inside the new nav shell.
 */
export function CollectionsSection({ isOpen, location, params }: Props) {
  const dispatch = useDispatch();
  const { pathname } = location;

  const questionId =
    isQuestionPath(pathname) || isModelPath(pathname) || isMetricPath(pathname)
      ? Urls.extractEntityId(params.slug)
      : null;
  const collectionId = isCollectionPath(pathname)
    ? Urls.extractEntityId(params.slug)
    : null;

  const { currentData: card } = useGetCardQuery(
    questionId ? { id: questionId } : skipToken,
  );
  const { currentData: collection } = useGetCollectionQuery(
    collectionId ? { id: collectionId } : skipToken,
  );

  const selectedItems = useMemo<SelectedItem[]>(() => {
    const question = card && new Question(card);
    return getSelectedItems({ pathname, params, question, collection });
  }, [pathname, params, card, collection]);

  return (
    <MainNavbarContainer
      isOpen={isOpen}
      location={location}
      params={params}
      selectedItems={selectedItems}
      openNavbar={() => dispatch(openNavbar())}
      closeNavbar={() => dispatch(closeNavbar())}
      onChangeLocation={(loc) => dispatch(push(loc))}
    />
  );
}
