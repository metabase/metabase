import React from "react";
import { CollectionId } from "metabase-types/api";
import QuestionLineage from "../../containers/QuestionLineage";
import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import { InfoBarRoot } from "./AppBarInfo.styled";

export interface AppBarInfoProps {
  collectionId?: CollectionId;
  isNavBarOpen?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
}

const AppBarInfo = ({
  collectionId,
  isNavBarOpen,
  isCollectionPathVisible,
  isQuestionLineageVisible,
}: AppBarInfoProps): JSX.Element => {
  return (
    <InfoBarRoot isNavBarOpen={isNavBarOpen}>
      {isQuestionLineageVisible ? (
        <QuestionLineage />
      ) : isCollectionPathVisible ? (
        <CollectionBreadcrumbs collectionId={collectionId} />
      ) : null}
    </InfoBarRoot>
  );
};

export default AppBarInfo;
