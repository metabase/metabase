import React from "react";
import { t } from "c-3po";
import RetinaImage from "react-retina-image";
import { withRouter } from "react-router";

import Link from "metabase/components/Link";

import * as Urls from "metabase/lib/urls";

import EmptyState from "metabase/components/EmptyState";

const CollectionEmptyState = ({ params }) => {
  return (
    <EmptyState
      title={t`This collection is empty, like a blank canvas`}
      message={t`You can use collections to organize and group dashboards, questions and pulses for your team or yourself`}
      illustrationElement={
        <RetinaImage
          src="app/img/collection-empty-state.png"
          className="block ml-auto mr-auto"
        />
      }
      link={
        <Link
          className="link text-bold"
          mt={2}
          to={Urls.newCollection(params.collectionId)}
        >{t`Create another collection`}</Link>
      }
    />
  );
};

export default withRouter(CollectionEmptyState);
