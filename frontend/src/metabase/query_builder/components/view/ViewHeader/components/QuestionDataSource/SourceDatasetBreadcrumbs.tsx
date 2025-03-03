import type { ReactElement } from "react";
import { t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs/HeaderBreadcrumbs";

import { getQuestionIcon } from "./utils";

interface SourceDatasetBreadcrumbsProps {
  divider?: ReactElement | string;
  question: Question;
  variant: "head" | "subhead";
}

export function SourceDatasetBreadcrumbs({
  question,
  ...props
}: SourceDatasetBreadcrumbsProps) {
  const collectionId = question.collectionId();

  const { data: collection, isFetching } = useGetCollectionQuery(
    collectionId ? { id: collectionId } : skipToken,
  );

  if (isFetching) {
    return null;
  }

  return (
    <HeadBreadcrumbs
      {...props}
      parts={[
        <HeadBreadcrumbs.Badge
          key="dataset-collection"
          to={Urls.collection(collection)}
          icon={getQuestionIcon(question)}
          inactiveColor="text-light"
        >
          {collection?.name || t`Our analytics`}
        </HeadBreadcrumbs.Badge>,
        question.isArchived() ? (
          <Tooltip
            key="dataset-name"
            label={t`This model is archived and shouldn't be used.`}
            maw="auto"
            position="bottom"
          >
            <span>
              <HeadBreadcrumbs.Badge
                inactiveColor="text-light"
                icon={{ name: "warning", color: color("danger") }}
              >
                {question.displayName()}
              </HeadBreadcrumbs.Badge>
            </span>
          </Tooltip>
        ) : (
          <HeadBreadcrumbs.Badge
            to={Urls.question(question.card())}
            inactiveColor="text-light"
          >
            {question.displayName()}
          </HeadBreadcrumbs.Badge>
        ),
      ]}
    />
  );
}
