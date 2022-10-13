import React, { useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import { connect } from "react-redux";

import type {
  ActionDisplayType,
  Dashboard,
  WritebackAction,
  Card,
  CustomDestinationClickBehavior,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import Search from "metabase/entities/search";

import Sidebar from "metabase/dashboard/components/Sidebar";
import ActionPicker from "metabase/containers/ActionPicker";
import {
  addActionToDashboard,
  addLinkToDashboard,
  closeSidebar,
} from "metabase/dashboard/actions";

import { ButtonOptions } from "./ButtonOptions";
import {
  Heading,
  SidebarContent,
  BorderedSidebarContent,
} from "./AddActionSidebar.styled";

const mapDispatchToProps = {
  addAction: addActionToDashboard,
  addLink: addLinkToDashboard,
  closeSidebar,
};

interface ActionSidebarProps {
  dashboard: Dashboard;
  addAction: ({
    dashId,
    action,
    displayType,
  }: {
    dashId: number;
    action: WritebackAction;
    displayType: ActionDisplayType;
  }) => void;
  addLink: ({
    dashId,
    clickBehavior,
  }: {
    dashId: number;
    clickBehavior: CustomDestinationClickBehavior;
  }) => void;
  closeSidebar: () => void;
  models: Card[];
  displayType: ActionDisplayType;
}

function AddActionSidebarFn({
  dashboard,
  addAction,
  addLink,
  closeSidebar,
  models,
  displayType,
}: ActionSidebarProps) {
  const handleActionSelected = async (action: WritebackAction) => {
    await addAction({ dashId: dashboard.id, action, displayType });
  };
  const modelIds = models?.map(model => model.id) ?? [];
  const showButtonOptions = displayType === "button";
  const showActionPicker = displayType === "form";

  return (
    <Sidebar>
      <BorderedSidebarContent>
        <Heading>
          {t`Add a ${
            displayType === "button" ? t`button` : t`form`
          } to the page`}
        </Heading>
      </BorderedSidebarContent>

      {showActionPicker && (
        <SidebarContent>
          <ActionPicker modelIds={modelIds} onClick={handleActionSelected} />
        </SidebarContent>
      )}

      {showButtonOptions && (
        <ButtonOptions
          addLink={addLink}
          closeSidebar={closeSidebar}
          dashboard={dashboard}
          ActionPicker={
            <SidebarContent>
              <ActionPicker
                modelIds={modelIds}
                onClick={handleActionSelected}
              />
            </SidebarContent>
          }
        />
      )}
    </Sidebar>
  );
}

export const AddActionSidebar = _.compose(
  Search.loadList({
    query: (_state: State, props: any) => ({
      models: ["dataset"],
      collection: props.dashboard.collection_id,
    }),
    loadingAndErrorWrapper: false,
    listName: "models",
  }),
  connect(null, mapDispatchToProps),
)(AddActionSidebarFn);
