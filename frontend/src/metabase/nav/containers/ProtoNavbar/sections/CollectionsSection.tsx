import { useMemo } from "react";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
} from "metabase/api";
import { useQuestionFromCard } from "metabase/metadata-store";
import { useDispatch } from "metabase/redux";
import { closeNavbar, openNavbar } from "metabase/redux/app";
import { type Location, useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";

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
  const navigate = useNavigate();
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

  const question = useQuestionFromCard(card);
  const selectedItems = useMemo<SelectedItem[]>(
    () => getSelectedItems({ pathname, params, question, collection }),
    [pathname, params, question, collection],
  );

  return (
    <MainNavbarContainer
      isOpen={isOpen}
      location={location}
      params={params}
      selectedItems={selectedItems}
      openNavbar={() => dispatch(openNavbar())}
      closeNavbar={() => dispatch(closeNavbar())}
      onChangeLocation={navigate}
    />
  );
}
