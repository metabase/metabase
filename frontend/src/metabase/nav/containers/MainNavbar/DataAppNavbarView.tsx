import React, { useCallback, useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
import { LocationDescriptor } from "history";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import * as Urls from "metabase/lib/urls";

import { DataApp } from "metabase-types/api";
import { State } from "metabase-types/store";

import { MainNavbarProps, SelectedItem } from "./types";
import {
  ExitDataAppButton,
  PaddedSidebarLink,
  SidebarContentRoot,
  SidebarHeading,
  SidebarHeadingWrapper,
  SidebarSection,
} from "./MainNavbar.styled";

interface OwnProps extends MainNavbarProps {
  dataApp: DataApp;
  items: any[];
  selectedItems: SelectedItem[];
}

interface DispatchProps {
  onChangeLocation: (location: LocationDescriptor) => void;
}

type Props = OwnProps & DispatchProps;

const mapDispatchToProps = {
  onChangeLocation: push,
};

function DataAppNavbarView({
  dataApp,
  items,
  selectedItems,
  onChangeLocation,
}: Props) {
  const appPages = useMemo(
    () => items.filter(item => item.model === "dashboard"),
    [items],
  );

  const handleExitApp = useCallback(() => {
    onChangeLocation(Urls.dataAppPreview(dataApp));
  }, [dataApp, onChangeLocation]);

  const { "data-app-page": dataAppPage } = _.indexBy(
    selectedItems,
    item => item.type,
  );

  return (
    <SidebarContentRoot>
      <SidebarSection>
        <SidebarHeadingWrapper>
          <SidebarHeading>{dataApp.collection.name}</SidebarHeading>
        </SidebarHeadingWrapper>
        {appPages.map(page => (
          <PaddedSidebarLink
            key={page.id}
            url={Urls.dataAppPage(dataApp, page)}
            isSelected={dataAppPage?.id === page.id}
          >
            {page.name}
          </PaddedSidebarLink>
        ))}
      </SidebarSection>
      <SidebarSection>
        <ExitDataAppButton
          small
          onClick={handleExitApp}
        >{t`Exit app`}</ExitDataAppButton>
      </SidebarSection>
    </SidebarContentRoot>
  );
}

export default connect<unknown, DispatchProps, OwnProps, State>(
  null,
  mapDispatchToProps,
)(DataAppNavbarView);
