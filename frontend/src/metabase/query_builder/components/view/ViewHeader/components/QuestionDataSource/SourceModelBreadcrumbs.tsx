import type { ReactElement } from "react";
import { t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs/HeaderBreadcrumbs";

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
  const getIcon = useGetIcon();

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
        <HeadBreadcrumbs.Breadcrumb
          key="collection"
          to={Urls.collection(collection)}
          icon={getIcon({ model: "card", type: question.type() }).name}
          color="text-disabled"
        >
          {collection?.name || t`Our analytics`}
        </HeadBreadcrumbs.Breadcrumb>,
        question.isArchived() ? (
          <Tooltip
            key="name"
            label={t`This model is archived and shouldn't be used.`}
            maw="auto"
            position="bottom"
          >
            {/* We use span here for ref forwarding */}
            <span>
              <HeadBreadcrumbs.Breadcrumb
                icon="warning"
                iconColor="danger"
                to={Urls.card(question.card())}
              >
                {question.displayName()}
              </HeadBreadcrumbs.Breadcrumb>
            </span>
          </Tooltip>
        ) : (
          <HeadBreadcrumbs.Breadcrumb
            key="name"
            to={Urls.card(question.card())}
          >
            {question.displayName()}
          </HeadBreadcrumbs.Breadcrumb>
        ),
      ]}
    />
  );
}
