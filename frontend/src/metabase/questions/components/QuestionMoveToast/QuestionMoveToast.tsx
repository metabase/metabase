import { Fragment } from "react";
import { match } from "ts-pattern";
import { jt } from "ttag";

import { useGetCollectionQuery } from "metabase/api";
import { coerceCollectionId } from "metabase/collections/utils";
import * as Urls from "metabase/lib/urls";
import type Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";

import {
  CollectionLink,
  StyledIcon,
  ToastRoot,
} from "./QuestionMoveToast.styled";

interface QuestionMoveToastProps {
  collectionId: CollectionId;
  question: Question;
}

function QuestionMoveToast({ collectionId, question }: QuestionMoveToastProps) {
  const id = coerceCollectionId(collectionId);
  const type = question.type();
  const { data: collection } = useGetCollectionQuery({ id });
  const collectionLink = collection ? (
    <CollectionLink key="collection-link" to={Urls.collection(collection)}>
      {collection.name}
    </CollectionLink>
  ) : (
    <Fragment key="fragment" />
  );

  return (
    <ToastRoot>
      <StyledIcon name="collection" />
      {match(type)
        .with("question", () => jt`Question moved to ${collectionLink}`)
        .with("model", () => jt`Model moved to ${collectionLink}`)
        .with("metric", () => jt`Metric moved to ${collectionLink}`)
        .exhaustive()}
    </ToastRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionMoveToast;
