import React from "react";
import { Flex } from "grid-styled";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import fitViewport from "metabase/hoc/FitViewPort";

import Icon from "metabase/components/Icon";
import EmptyState from "metabase/components/EmptyState";
import ErrorDetails from "metabase/components/ErrorDetails";

import NoResults from "assets/img/no_results.svg";

const ErrorPageWrapper = fitViewport(({ fitClassNames, children }) => (
  <Flex
    align="center"
    flexDirection="column"
    justify="center"
    className={fitClassNames}
  >
    {children}
  </Flex>
));

export const GenericError = ({
  title = t`Something's gone wrong`,
  message = t`We've run into an error. You can try refreshing the page, or just go back.`,
  details = null,
}) => (
  <ErrorPageWrapper>
    <EmptyState
      title={title}
      message={message}
      illustrationElement={
        <div className="QueryError-image QueryError-image--serverError" />
      }
    />
    <ErrorDetails className="pt2" details={details} centered />
  </ErrorPageWrapper>
);

export const NotFound = () => (
  <ErrorPageWrapper>
    <EmptyState
      illustrationElement={<img src={NoResults} />}
      title={t`We're a little lost...`}
      message={t`The page you asked for couldn't be found.`}
      link={Urls.question()}
    />
  </ErrorPageWrapper>
);

export const Unauthorized = () => (
  <ErrorPageWrapper>
    <EmptyState
      title={t`Sorry, you don’t have permission to see that.`}
      illustrationElement={<Icon name="key" size={100} />}
    />
  </ErrorPageWrapper>
);

export const Archived = ({ entityName, linkTo }) => (
  <ErrorPageWrapper>
    <EmptyState
      title={t`This ${entityName} has been archived`}
      illustrationElement={<Icon name="view_archive" size={100} />}
      link={linkTo}
    />
  </ErrorPageWrapper>
);
