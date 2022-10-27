import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import DataApps from "metabase/entities/data-apps";

import * as Urls from "metabase/lib/urls";

import type { DataApp } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type Question from "metabase-lib/Question";

import {
  EmptyStateContainer,
  EmptyStateTitle,
} from "../ModelDetailPage.styled";
import { AppListItem, AppTitle } from "./ModelApps.styled";

interface OwnProps {
  model: Question;
}

interface DataAppsLoaderProps {
  dataApps: DataApp[];
}

type Props = OwnProps & DataAppsLoaderProps;

function ModelApps({ dataApps }: Props) {
  if (dataApps.length === 0) {
    return (
      <EmptyStateContainer>
        <EmptyStateTitle>{t`This model is not used in any apps yet.`}</EmptyStateTitle>
      </EmptyStateContainer>
    );
  }

  return (
    <ul>
      {dataApps.map(dataApp => (
        <li key={dataApp.id}>
          <AppListItem to={Urls.dataApp(dataApp)}>
            <Icon name="star" />
            <AppTitle>{dataApp.collection.name}</AppTitle>
          </AppListItem>
        </li>
      ))}
    </ul>
  );
}

function getDataAppsQuery(state: State, { model }: OwnProps) {
  return {
    using_model: model.id(),
  };
}

export default DataApps.loadList({
  query: getDataAppsQuery,
})(ModelApps);
