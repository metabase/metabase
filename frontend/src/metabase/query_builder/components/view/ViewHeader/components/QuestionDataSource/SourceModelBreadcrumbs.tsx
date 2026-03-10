import type { ReactElement } from "react";
import { t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs/HeaderBreadcrumbs";

import { getQuestionIcon } from "./utils";

interface SourceModelBreadcrumbsProps {
  divider?: ReactElement | string;
  question: Question;
  variant: "head" | "subhead";
}

export function SourceModelBreadcrumbs({
  question,
  ...props
}: SourceModelBreadcrumbsProps) {
  const collectionId = question.collectionId();

  const { data: collection, isLoading } = useGetCollectionQuery(
    collectionId ? { id: collectionId } : skipToken,
  );

  if (isLoading) {
    return null;
  }

  return (
    <HeadBreadcrumbs
      {...props}
      parts={[
        <HeadBreadcrumbs.Badge
          key="collection"
          to={Urls.collection(collection)}
          icon={getQuestionIcon(question)}
          inactiveColor="text-tertiary"
        >
          {collection?.name || t`Our analytics`}
        </HeadBreadcrumbs.Badge>,
        question.isArchived() ? (
          <Tooltip
            key="name"
            label={t`This model is archived and shouldn't be used.`}
            maw="auto"
            position="bottom"
          >
            {/* We use span here for ref forwarding */}
            <span>
              <HeadBreadcrumbs.Badge
                inactiveColor="text-tertiary"
                icon={{ name: "warning", c: "danger" }}
                to={Urls.question(question.card())}
              >
                {question.displayName()}
              </HeadBreadcrumbs.Badge>
            </span>
          </Tooltip>
        ) : (
          <HeadBreadcrumbs.Badge
            key="name"
            to={Urls.question(question.card())}
            inactiveColor="text-tertiary"
          >
            {question.displayName()}
          </HeadBreadcrumbs.Badge>
        ),
      ]}
    />
  );
}
