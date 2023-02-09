/* eslint-disable react/prop-types */
import React, { useState, useEffect } from "react";

import { t } from "ttag";
import _ from "underscore";
import AdminContentTable from "metabase/components/AdminContentTable";
import { PermissionsApi, SettingsApi } from "metabase/services";
import { isDefaultGroup } from "metabase/lib/groups";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import SettingToggle from "../SettingToggle";
import AddMappingRow from "./AddMappingRow";
import {
  GroupMappingsWidgetRoot as Root,
  GroupMappingsWidgetHeader as Header,
  GroupMappingsWidgetToggleRoot as ToggleRoot,
  GroupMappingsWidgetAbout as About,
  GroupMappingsWidgetAboutContentRoot as AboutContentRoot,
  AddMappingButton,
} from "./GroupMappingsWidget.styled";
import MappingRow from "./MappingRow";
import DeleteGroupMappingModal from "./DeleteGroupMappingModal";

const groupIsMappable = group => !isDefaultGroup(group);

// ⚠️ Uncomment
/*
const whenDeletingMappingGroups = {
  groupsToClearAllPermissions: [],
  groupsToDelete: [],
};
*/

function GroupMappingsWidget({ mappingSetting, ...props }) {
  const [showAddRow, setShowAddRow] = useState(false);
  const [showDeleteMappingModal, setShowDeleteMappingModal] = useState(false);
  const [groups, setGroups] = useState(null);
  const [mappings, setMappings] = useState({});
  const [savedMappings, setSavedMappings] = useState({});
  const [saveError, setSaveError] = useState(null);
  const [dnForVisibleDeleteMappingModal, setDnForVisibleDeleteMappingModal] =
    useState(null);
  const [
    groupIdsForVisibleDeleteMappingModal,
    setGroupIdsForVisibleDeleteMappingModal,
  ] = useState(null);

  useEffect(() => {
    async function fetchData() {
      const setting = _.findWhere(await SettingsApi.list(), {
        key: mappingSetting,
      });

      setMappings(setting?.value || {});
      setSavedMappings(setting?.value || {});

      PermissionsApi.groups().then(groups =>
        setGroups(groups.filter(groupIsMappable)),
      );
    }

    fetchData();
  }, [mappingSetting]);

  const handleShowAddRow = e => {
    e.preventDefault();
    setShowAddRow(true);
  };

  const handleHideAddRow = () => {
    setShowAddRow(false);
  };

  const handleAddMapping = dn => {
    const mappingsPlusNewMapping = { ...mappings, [dn]: [] };

    SettingsApi.put({
      key: mappingSetting,
      value: mappingsPlusNewMapping,
    }).then(
      () => {
        props.onChangeSetting(mappingSetting, mappings);
        setMappings(mappingsPlusNewMapping);

        setShowAddRow(false);
        setSaveError(null);
      },
      e => setSaveError(e),
    );
  };

  const handleChangeMapping = dn => (group, selected) => {
    if (selected) {
      setMappings({ ...mappings, [dn]: [...mappings[dn], group.id] });
    } else {
      setMappings({
        ...mappings,
        [dn]: mappings[dn].filter(id => id !== group.id),
      });
    }
  };

  const handleShowDeleteMappingModal = (groups, dn) => {
    setShowDeleteMappingModal(true);
    setDnForVisibleDeleteMappingModal(dn);
    setGroupIdsForVisibleDeleteMappingModal(groups);
  };

  const handleHideDeleteMappingModal = () => {
    setShowDeleteMappingModal(false);
    setDnForVisibleDeleteMappingModal(null);
    setGroupIdsForVisibleDeleteMappingModal(null);
  };

  const handleConfirmDeleteMapping = (whatToDoAboutGroups, groups, dn) => {
    handleDeleteMapping(dn);

    setShowDeleteMappingModal(false);
    setDnForVisibleDeleteMappingModal(null);
    setGroupIdsForVisibleDeleteMappingModal(null);

    updateGroupsListsForCallbacksAfterDeletingMappings(
      whatToDoAboutGroups,
      groups,
    );
  };

  const updateGroupsListsForCallbacksAfterDeletingMappings = (
    whatToDoAboutGroups,
    groupIds,
  ) => {
    if (whatToDoAboutGroups === "nothing") {
      return;
    }

    // ⚠️ Uncomment and translate
    /*
    const allGroupIdsExceptAdmin = groupIds.filter(
      groupId => !isAdminGroup(groups.find(group => group.id === groupId)),
    );

    const stateKey = {
      clear: "groupsToClearAllPermissions",
      delete: "groupsToDelete",
    }[whatToDoAboutGroups];

    this.setState(({ whenDeletingMappingGroups }) => ({
      whenDeletingMappingGroups: {
        ...whenDeletingMappingGroups,
        [stateKey]: _.uniq(
          whenDeletingMappingGroups[stateKey].concat(allGroupIdsExceptAdmin),
        ),
      },
    }));
    */
  };

  const handleDeleteMapping = dn => {
    setMappings(_.omit(mappings, dn));
  };

  // ⚠️ This happened after closing the modal
  // TODO: move what's usable of this to save of entire auth method page
  /*
  const handleUpdateMappings = e => {
    e.preventDefault();

    const { mappingSetting, onChangeSetting } = props;

    SettingsApi.put({ key: mappingSetting, value: mappings }).then(
      () => {
        onChangeSetting(mappingSetting, mappings);

        updateGroupsFromDeletedMappings();

        setShowAddRow(false);
        setSaveError(null);
      },
      e => setSaveError(e),
    );
  };

  const updateGroupsFromDeletedMappings = () => {
    const { groupsToDelete } = whenDeletingMappingGroups;

    groupsToDelete.forEach(id => PermissionsApi.deleteGroup({ id }));

    // Avoid calling the API for groups that have just been deleted
    getGroupsToClearAllPermissionsThatAreNotAlsoGroupsToDelete().forEach(id =>
      PermissionsApi.clearGroupMembership({ id }),
    );
  };

  const getGroupsToClearAllPermissionsThatAreNotAlsoGroupsToDelete = () => {
    const { groupsToClearAllPermissions, groupsToDelete } =
      whenDeletingMappingGroups;

    return groupsToClearAllPermissions.filter(
      groupToClearAllPermission =>
        !groupsToDelete.includes(groupToClearAllPermission),
    );
  };
  */

  return (
    <Root>
      <Header>
        <ToggleRoot>
          <span>{t`Synchronize Group Memberships`}</span>
          <SettingToggle {...props} hideLabel />
        </ToggleRoot>
        <About>
          <Tooltip
            tooltip={t`Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the directory server. Users are only ever added to or removed from mapped groups.`}
            placement="top"
          >
            <AboutContentRoot>
              <Icon name="info" />
              <span>{t`About mappings`}</span>
            </AboutContentRoot>
          </Tooltip>
        </About>
      </Header>

      <div>
        <div>
          <AddMappingButton primary small onClick={handleShowAddRow}>
            {t`New mapping`}
          </AddMappingButton>
          <AdminContentTable columnTitles={[props.groupHeading, t`Groups`, ""]}>
            {showAddRow && (
              <AddMappingRow
                mappings={mappings}
                onCancel={handleHideAddRow}
                onAdd={handleAddMapping}
                placeholder={props.groupPlaceholder}
              />
            )}
            {Object.keys(mappings).length === 0 && (
              <tr>
                <td>&nbsp;</td>
                <td> {t`No mappings yet`}</td>
                <td>&nbsp;</td>
              </tr>
            )}
            {Object.entries(mappings).map(([dn, ids]) => (
              <MappingRow
                key={dn}
                dn={dn}
                groups={groups || []}
                savedMappings={savedMappings}
                selectedGroupIds={ids}
                onChange={handleChangeMapping(dn)}
                onShowDeleteMappingModal={handleShowDeleteMappingModal}
                onDeleteMapping={handleDeleteMapping}
              />
            ))}
          </AdminContentTable>
        </div>
        <div>
          {saveError?.data?.message && (
            <span className="text-error text-bold">
              {saveError.data.message}
            </span>
          )}
        </div>
      </div>
      {showDeleteMappingModal && (
        <DeleteGroupMappingModal
          dn={dnForVisibleDeleteMappingModal}
          groupIds={groupIdsForVisibleDeleteMappingModal}
          onHide={handleHideDeleteMappingModal}
          onConfirm={handleConfirmDeleteMapping}
        />
      )}
    </Root>
  );
}

export default GroupMappingsWidget;
