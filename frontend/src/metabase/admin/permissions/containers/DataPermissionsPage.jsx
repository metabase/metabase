/* eslint-disable react/prop-types */
import React, { useEffect } from "react";
import { Flex } from "grid-styled";
import _ from "underscore";

import { Sidebar } from "../components/sidebar";

import Groups from "metabase/entities/groups";

import { connect } from "react-redux";

import { getSidebarState, getIsDirty, getDiff } from "../new_selectors";
import {
  updatePermission,
  savePermissions,
  loadPermissions,
} from "../permissions";
import { PermissionEditor } from "../components/permission-editor/PermissionEditor";
import PermissionsTabs from "../components/PermissionsTabs";

function NewDataPermissionsPage({ sidebar, loadGroups }) {
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const entities = [
    {
      id: 1,
      name: "foo",
      permissions: {
        kek: {
          icon: "arrow_left",
          value: "yo1",
        },
        kek2: {
          icon: "arrow_left",
          value: "yo3",
        },
      },
    },
    {
      id: 2,
      name: "foo 2",
      permissions: {
        kek: {
          icon: "arrow_left",
          value: "yo1",
        },
        kek2: {
          icon: "arrow_left",
          value: "yo3",
        },
      },
    },
    {
      id: 3,
      name: "foo 3",
      permissions: {
        kek: {
          icon: "arrow_left",
          value: "yo1",
        },
        kek2: {
          icon: "arrow_left",
          value: "yo3",
        },
      },
    },
  ];

  const permissions = [
    {
      displayName: "Kek",
      name: "kek",
      options: [
        {
          label: "Database",
          value: "yo1",
          icon: "arrow_left",
          iconColor: "red",
        },
        {
          label: "Database2",
          value: "yo2",
          icon: "arrow_left",
          iconColor: "green",
        },
        {
          label: "Database3",
          value: "yo3",
          icon: "arrow_left",
          iconColor: "red",
        },
      ],
    },
    {
      displayName: "Kek 2",
      name: "kek2",
      options: [
        {
          label: "Database",
          value: "yo1",
          icon: "arrow_left",
          iconColor: "red",
        },
        {
          label: "Database2",
          value: "yo2",
          icon: "arrow_left",
          iconColor: "green",
        },
        {
          label: "Database3",
          value: "yo3",
          icon: "arrow_left",
          iconColor: "red",
        },
      ],
    },
  ];

  return (
    <Flex flexDirection="column">
      <div className="border-bottom">
        <PermissionsTabs tab="databases" onChangeTab={() => {}} />
      </div>
      <Flex>
        <Sidebar {...sidebar} />
        <PermissionEditor
          title="Permissions for Marketing"
          filterPlaceholder="Search tables"
          entities={entities}
          permissions={permissions}
          entityName="databases"
        />
      </Flex>
    </Flex>
  );
}

const mapStateToProps = (state, props) => {
  return {
    sidebar: getSidebarState(state, props),
    isDirty: getIsDirty(state, props),
    diff: getDiff(state, props),
    tab: "databases",
  };
};

const mapDispatchToProps = {
  onUpdatePermission: updatePermission,
  onSave: savePermissions,
  onCancel: loadPermissions,
  loadGroups: Groups.actions.fetchList,
  // onChangeTab: tab => push(`/admin/permissions/${tab}`),
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(NewDataPermissionsPage);
