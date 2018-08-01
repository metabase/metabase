import React from "react";
import { Flex } from "grid-styled";
import { t } from "c-3po";

import * as Urls from "metabase/lib/urls";
import fitViewport from "metabase/hoc/FitViewPort";

import Icon from "metabase/components/Icon";
import EmptyState from "metabase/components/EmptyState";

const ErrorPageWrapper = fitViewport(({ fitClassNames, children }) => (
  <Flex align="center" justify="center" className={fitClassNames}>
    {children}
  </Flex>
));

export const NotFound = () => (
  <ErrorPageWrapper>
    <EmptyState
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
      illustrationElement={<Icon name="viewArchive" size={100} />}
      link={linkTo}
    />
  </ErrorPageWrapper>
);
