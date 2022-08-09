/* eslint-disable react/prop-types */
import React from "react";

import { ModalFooter } from "metabase/components/ModalContent";
import AdminContentTable from "metabase/components/AdminContentTable";
import Button from "metabase/core/components/Button";
import GroupSelect from "metabase/admin/people/components/GroupSelect";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import Modal from "metabase/components/Modal";
import { t } from "ttag";
import { PermissionsApi, SettingsApi } from "metabase/services";
import { isDefaultGroup } from "metabase/lib/groups";

import _ from "underscore";

import SettingToggle from "./SettingToggle";

const groupIsMappable = group => !isDefaultGroup(group);

export default class GroupMappingsWidget extends React.Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      showEditModal: false,
      showAddRow: false,
      groups: null,
      mappings: {},
      saveError: null,
    };
  }

  _showEditModal = async e => {
    e.preventDefault();
    // just load the setting again to make sure it's up to date
    const setting = _.findWhere(await SettingsApi.list(), {
      key: this.props.mappingSetting,
    });
    this.setState({
      mappings: (setting && setting.value) || {},
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

  _deleteMapping = dn => e => {
    e.preventDefault();
    this.setState(prevState => ({
      mappings: _.omit(prevState.mappings, dn),
    }));
  };

  _cancelClick = e => {
    e.preventDefault();
    this.setState({ showEditModal: false, showAddRow: false });
  };

  _saveClick = e => {
    e.preventDefault();
    const {
      state: { mappings },
      props: { onChangeSetting },
    } = this;
    SettingsApi.put({ key: this.props.mappingSetting, value: mappings }).then(
      () => {
        onChangeSetting(this.props.mappingSetting, mappings);
        this.setState({
          showEditModal: false,
          showAddRow: false,
          saveError: null,
        });
      },
      e => this.setState({ saveError: e }),
    );
  };

  render() {
    const { showEditModal, showAddRow, groups, mappings, saveError } =
      this.state;

    return (
      <div className="flex align-center">
        <SettingToggle {...this.props} />
        <div className="flex align-center pt1">
          <Button
            type="button"
            className="ml1"
            medium
            onClick={this._showEditModal}
          >{t`Edit Mappings`}</Button>
        </div>
        {showEditModal ? (
          <Modal wide>
            <div>
              <div className="pt4 px4">
                <h2>{t`Group Mappings`}</h2>
              </div>
              <div className="px4">
                <Button
                  className="float-right"
                  primary
                  onClick={this._showAddRow}
                >{t`Create a mapping`}</Button>
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
                  {Object.entries(mappings).map(([dn, ids]) => (
                    <MappingRow
                      key={dn}
                      dn={dn}
                      groups={groups || []}
                      selectedGroups={ids}
                      onChange={this._changeMapping(dn)}
                      onDelete={this._deleteMapping(dn)}
                    />
                  ))}
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
                <Button primary onClick={this._saveClick}>{t`Save`}</Button>
              </ModalFooter>
            </div>
          </Modal>
        ) : null}
      </div>
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

class MappingGroupSelect extends React.Component {
  render() {
    const { groups, selectedGroups, onGroupChange } = this.props;

    if (!groups) {
      return <LoadingSpinner />;
    }

    return (
      <GroupSelect
        groups={groups}
        selectedGroupIds={selectedGroups}
        onGroupChange={onGroupChange}
        emptyListMessage={t`No mappable groups`}
      />
    );
  }
}

class MappingRow extends React.Component {
  render() {
    const { dn, groups, selectedGroups, onChange, onDelete } = this.props;

    return (
      <tr>
        <td>{dn}</td>
        <td>
          <MappingGroupSelect
            groups={groups}
            selectedGroups={selectedGroups}
            onGroupChange={onChange}
          />
        </td>
        <td className="Table-actions">
          <Button warning onClick={onDelete}>{t`Remove`}</Button>
        </td>
      </tr>
    );
  }
}
