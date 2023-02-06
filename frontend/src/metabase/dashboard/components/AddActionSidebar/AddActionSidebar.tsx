import React from "react";
import _ from "underscore";
import { t } from "ttag";
import { connect } from "react-redux";

import type {
  ActionDisplayType,
  Dashboard,
  WritebackAction,
  Card,
} from "metabase-types/api";

import Search from "metabase/entities/search";

import ActionPicker from "metabase/actions/containers/ActionPicker";
import Sidebar from "metabase/dashboard/components/Sidebar";
import { addActionToDashboard, closeSidebar } from "metabase/dashboard/actions";

import {
  Heading,
  SidebarContent,
  BorderedSidebarContent,
} from "./AddActionSidebar.styled";

const mapDispatchToProps = {
  addAction: addActionToDashboard,
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
  models: Card[];
  displayType: ActionDisplayType;
}

function AddActionSidebarFn({
  dashboard,
  addAction,
  models,
  displayType,
}: ActionSidebarProps) {
  const handleActionSelected = async (action: WritebackAction) => {
    await addAction({ dashId: dashboard.id, action, displayType });
  };
  const modelIds = models?.map(model => model.id) ?? [];

  return (
    <Sidebar>
      <BorderedSidebarContent>
        <Heading>
          {t`Add a ${
            displayType === "button" ? t`button` : t`form`
          } to the dashboard`}
        </Heading>
      </BorderedSidebarContent>

      <SidebarContent>
        <ActionPicker modelIds={modelIds} onClick={handleActionSelected} />
      </SidebarContent>
    </Sidebar>
  );
}

export const AddActionSidebar = _.compose(
  Search.loadList({
    query: () => ({
      models: ["dataset"],
    }),
    loadingAndErrorWrapper: false,
    listName: "models",
  }),
  connect(null, mapDispatchToProps),
)(AddActionSidebarFn);
