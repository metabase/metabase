/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";
import _ from "underscore";
import { ModalFooter } from "metabase/components/ModalContent";
import AdminContentTable from "metabase/components/AdminContentTable";
import Button from "metabase/core/components/Button";
import { PermissionsApi, SettingsApi } from "metabase/services";
import { isDefaultGroup, isAdminGroup } from "metabase/lib/groups";

import SettingToggle from "../SettingToggle";
import {
  GroupMappingsWidgetRoot as Root,
  GroupMappingsWidgetHeader as Header,
  GroupMappingsWidgetToggleRoot as ToggleRoot,
} from "./GroupMappingsWidget.styled";
import MappingRow from "./LDAPMappingRow";
import DeleteGroupMappingModal from "./DeleteGroupMappingModal";

const groupIsMappable = group => !isDefaultGroup(group);

export default class GroupMappingsWidget extends React.Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      showDeleteMappingModal: false,
      showEditModal: false,
      showAddRow: false,
      groups: null,
      mappings: {},
      savedMappings: {},
      saveError: null,
      dnForVisibleDeleteMappingModal: null,
      groupIdsForVisibleDeleteMappingModal: null,
      whenDeletingMappingGroups: {
        groupsToClearAllPermissions: [],
        groupsToDelete: [],
      },
    };
  }

  _showEditModal = async e => {
    e.preventDefault();

    // just load the setting again to make sure it's up to date
    const setting = _.findWhere(await SettingsApi.list(), {
      key: this.props.mappingSetting,
    });

    this.setState({
      mappings: setting?.value || {},
      savedMappings: setting?.value || {},
      showEditModal: true,
    });

    PermissionsApi.groups().then(groups =>
      this.setState({ groups: groups.filter(groupIsMappable) }),
    );
  };

  _showAddRow = e => {
    e.preventDefault();
    this.setState({ showAddRow: true });
  };

  _hideAddRow = () => {
    this.setState({ showAddRow: false });
  };

  _addMapping = dn => {
    this.setState(prevState => ({
      mappings: { ...prevState.mappings, [dn]: [] },
      showAddRow: false,
    }));
  };

  _changeMapping = dn => (group, selected) => {
    if (selected) {
      this.setState(prevState => ({
        mappings: {
          ...prevState.mappings,
          [dn]: [...prevState.mappings[dn], group.id],
        },
      }));
    } else {
      this.setState(prevState => ({
        mappings: {
          ...prevState.mappings,
          [dn]: prevState.mappings[dn].filter(id => id !== group.id),
        },
      }));
    }
  };

  handleShowDeleteMappingModal = (groups, dn) => {
    this.setState({
      showDeleteMappingModal: true,
      showEditModal: false,
      dnForVisibleDeleteMappingModal: dn,
      groupIdsForVisibleDeleteMappingModal: groups,
    });
  };

  handleHideDeleteMappingModal = () => {
    this.setState({
      showDeleteMappingModal: false,
      showEditModal: true,
      dnForVisibleDeleteMappingModal: null,
      groupIdsForVisibleDeleteMappingModal: null,
    });
  };

  handleConfirmDeleteMapping = (whatToDoAboutGroups, groups, dn) => {
    this._deleteMapping(dn);

    this.setState({
      showDeleteMappingModal: false,
      showEditModal: true,
      dnForVisibleDeleteMappingModal: null,
      groupIdsForVisibleDeleteMappingModal: null,
    });

    this.updateGroupsListsForCallbacksAfterDeletingMappings(
      whatToDoAboutGroups,
      groups,
    );
  };

  updateGroupsListsForCallbacksAfterDeletingMappings = (
    whatToDoAboutGroups,
    groupIds,
  ) => {
    const { groups } = this.state;

    if (whatToDoAboutGroups === "nothing") {
      return;
    }

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
  };

  _deleteMapping = dn => {
    this.setState(prevState => ({
      mappings: _.omit(prevState.mappings, dn),
    }));
  };

  _cancelClick = e => {
    e.preventDefault();
    this.setState({
      showEditModal: false,
      showAddRow: false,
      dnForVisibleDeleteMappingModal: null,
      groupIdsForVisibleDeleteMappingModal: null,
      whenDeletingMappingGroups: {
        groupsToClearAllPermissions: [],
        groupsToDelete: [],
      },
    });
  };

  handleUpdateMappings = e => {
    e.preventDefault();

    const {
      state: { mappings },
      props: { mappingSetting, onChangeSetting },
    } = this;

    SettingsApi.put({ key: mappingSetting, value: mappings }).then(
      () => {
        onChangeSetting(mappingSetting, mappings);

        this.updateGroupsFromDeletedMappings();

        this.setState({
          showEditModal: false,
          showAddRow: false,
          saveError: null,
        });
      },
      e => this.setState({ saveError: e }),
    );
  };

  updateGroupsFromDeletedMappings = () => {
    const { groupsToDelete } = this.state.whenDeletingMappingGroups;

    groupsToDelete.forEach(id => PermissionsApi.deleteGroup({ id }));

    // Avoid calling the API for groups that have just been deleted
    this.getGroupsToClearAllPermissionsThatAreNotAlsoGroupsToDelete().forEach(
      id => PermissionsApi.clearGroupMembership({ id }),
    );
  };

  getGroupsToClearAllPermissionsThatAreNotAlsoGroupsToDelete = () => {
    const { groupsToClearAllPermissions, groupsToDelete } =
      this.state.whenDeletingMappingGroups;

    return groupsToClearAllPermissions.filter(
      groupToClearAllPermission =>
        !groupsToDelete.includes(groupToClearAllPermission),
    );
  };

  render() {
    const {
      showDeleteMappingModal,
      // showEditModal,
      showAddRow,
      groups,
      mappings,
      saveError,
      savedMappings,
      dnForVisibleDeleteMappingModal,
      groupIdsForVisibleDeleteMappingModal,
    } = this.state;

    return (
      <Root>
        <Header>
          <ToggleRoot>
            {t`Synchronize Group Memberships`}
            <SettingToggle {...this.props} hideLabel />
          </ToggleRoot>
        </Header>
        <div>
          <div className="pt4">
            <h2>{t`Group Mappings`}</h2>
          </div>
          <div>
            <Button
              className="float-right"
              primary
              onClick={this._showAddRow}
            >{t`New mapping`}</Button>
            <p className="text-measure">
              {t`Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the
                     directory server. Users are only ever added to or removed from mapped groups.`}
            </p>
            <AdminContentTable
              columnTitles={[this.props.groupHeading, t`Groups`, ""]}
            >
              {showAddRow ? (
                <AddMappingRow
                  mappings={mappings}
                  onCancel={this._hideAddRow}
                  onAdd={this._addMapping}
                  placeholder={this.props.groupPlaceholder}
                />
              ) : null}
              {Object.entries(mappings).map(([dn, ids]) => {
                const isMappingLinkedOnlyToAdminGroup =
                  groups &&
                  ids.length === 1 &&
                  isAdminGroup(groups.find(group => group.id === ids[0]));

                const isSavedMapping = Object.keys(savedMappings).includes(dn);

                const shouldUseDeleteMappingModal =
                  ids.length > 0 &&
                  !isMappingLinkedOnlyToAdminGroup &&
                  isSavedMapping;

                const onDelete = shouldUseDeleteMappingModal
                  ? () => this.handleShowDeleteMappingModal(ids, dn)
                  : () => this._deleteMapping(dn);

                return (
                  <MappingRow
                    key={dn}
                    dn={dn}
                    groups={groups || []}
                    selectedGroups={ids}
                    onChange={this._changeMapping(dn)}
                    onDelete={onDelete}
                  />
                );
              })}
            </AdminContentTable>
          </div>
          <ModalFooter>
            {saveError && saveError.data && saveError.data.message ? (
              <span className="text-error text-bold">
                {saveError.data.message}
              </span>
            ) : null}
            <Button
              type="button"
              onClick={this._cancelClick}
            >{t`Cancel`}</Button>
            <Button
              primary
              onClick={this.handleUpdateMappings}
            >{t`Save`}</Button>
          </ModalFooter>
        </div>
        {showDeleteMappingModal ? (
          <DeleteGroupMappingModal
            dn={dnForVisibleDeleteMappingModal}
            groupIds={groupIdsForVisibleDeleteMappingModal}
            onHide={this.handleHideDeleteMappingModal}
            onConfirm={this.handleConfirmDeleteMapping}
          />
        ) : null}
      </Root>
    );
  }
}

class AddMappingRow extends React.Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      value: "",
    };
  }

  _handleSubmit = e => {
    e.preventDefault();
    const { onAdd } = this.props;
    onAdd && onAdd(this.state.value);
    this.setState({ value: "" });
  };

  _handleCancelClick = e => {
    e.preventDefault();
    const { onCancel } = this.props;
    onCancel && onCancel();
    this.setState({ value: "" });
  };

  render() {
    const { value } = this.state;

    const isValid = value && this.props.mappings[value] === undefined;

    return (
      <tr>
        <td colSpan="3" style={{ padding: 0 }}>
          <form
            className="my2 pl1 p1 bordered border-brand rounded relative flex align-center"
            onSubmit={isValid ? this._handleSubmit : undefined}
          >
            <input
              className="input--borderless h3 ml1 flex-full"
              type="text"
              value={value}
              placeholder={this.props.placeholder}
              autoFocus
              onChange={e => this.setState({ value: e.target.value })}
            />
            <span
              className="link no-decoration cursor-pointer"
              onClick={this._handleCancelClick}
            >{t`Cancel`}</span>
            <Button
              className="ml2"
              type="submit"
              primary={!!isValid}
              disabled={!isValid}
            >{t`Add`}</Button>
          </form>
        </td>
      </tr>
    );
  }
}
