import React from "react";
import { t } from "ttag";
import { LocationDescriptor } from "history";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import Button from "metabase/core/components/Button";

import * as Urls from "metabase/lib/urls";
import DataApps from "metabase/entities/data-apps";

import { Collection, DataApp } from "metabase-types/api";
import { State } from "metabase-types/store";

interface OwnProps {
  collection: Collection;
}

interface StateProps {
  dataApp?: DataApp;
}

interface DispatchProps {
  onChangeLocation: (location: LocationDescriptor) => void;
}

type LaunchDataAppButtonProps = OwnProps & StateProps & DispatchProps;

function mapStateToProps(state: State, { collection }: OwnProps) {
  return {
    dataApp: DataApps.selectors.getObject(state, {
      entityId: collection.app_id,
    }),
  };
}

const mapDispatchToProps = {
  onChangeLocation: push,
};

const LaunchDataAppButton = ({
  dataApp,
  onChangeLocation,
}: LaunchDataAppButtonProps) => {
  if (!dataApp) {
    return null;
  }
  const path = Urls.dataApp(dataApp);
  return (
    <Button
      icon="rocket"
      onClick={() => onChangeLocation(path)}
      small
    >{t`Launch app`}</Button>
  );
};

export default connect<StateProps, DispatchProps, OwnProps, State>(
  mapStateToProps,
  mapDispatchToProps,
)(LaunchDataAppButton);
