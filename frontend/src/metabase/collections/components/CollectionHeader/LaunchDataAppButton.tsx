import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";

import * as Urls from "metabase/lib/urls";
import DataApps from "metabase/entities/data-apps";

import type { Collection, DataApp } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface OwnProps {
  collection: Collection;
}

interface StateProps {
  dataApp?: DataApp;
}

type LaunchDataAppButtonProps = OwnProps & StateProps;

function mapStateToProps(state: State, { collection }: OwnProps) {
  return {
    dataApp: DataApps.selectors.getObject(state, {
      entityId: collection.app_id,
    }),
  };
}

const LaunchDataAppButton = ({ dataApp }: LaunchDataAppButtonProps) => {
  if (!dataApp) {
    return null;
  }
  return (
    <Button
      icon="rocket"
      as={Link}
      to={Urls.dataApp(dataApp)}
      small
    >{t`Launch app`}</Button>
  );
};

export default connect<StateProps, unknown, OwnProps, State>(mapStateToProps)(
  LaunchDataAppButton,
);
