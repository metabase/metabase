// @flow

import React from "react";

import { ModalFooter } from "metabase/components/ModalContent";
import AdminContentTable from "metabase/components/AdminContentTable";
import Button from "metabase/components/Button";
import GroupSelect from "metabase/admin/people/components/GroupSelect";
import GroupSummary from "metabase/admin/people/components/GroupSummary";
import Icon from "metabase/components/Icon";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import Modal from "metabase/components/Modal";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { t } from "ttag";
import { PermissionsApi, SettingsApi } from "metabase/services";
import { isSpecialGroup } from "metabase/lib/groups";

import _ from "underscore";

import SettingToggle from "./SettingToggle";

type Props = {
  setting: any,
  onChange: (value: any) => void,
  settingValues: { [key: string]: any },
  onChangeSetting: (key: string, value: any) => void,
  mappingSetting: string,
  groupHeading: string,
  groupPlaceholder: string,
};

type State = {
  showEditModal: boolean,
  showAddRow: boolean,
  groups: ?(Object[]),
  mappings: { [string]: number[] },
  saveError: ?Object,
};

const groupIsMappable = group => !isSpecialGroup(group);

export default class GroupMappingsWidget extends React.Component {
  props: Props;
  state: State;

  constructor(props: Props, context: any) {
    super(props, context);
    this.state = {
      showEditModal: false,
      showAddRow: false,
      groups: null,
      mappings: {},
      saveError: null,
    };
  }

  _showEditModal = async (e: Event) => {
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

  _showAddRow = (e: Event) => {
    e.preventDefault();
    this.setState({ showAddRow: true });
  };

  _hideAddRow = () => {
    this.setState({ showAddRow: false });
  };

  _addMapping = (dn: string) => {
    this.setState((prevState: State) => ({
      mappings: { ...prevState.mappings, [dn]: [] },
      showAddRow: false,
    }));
  };

  _changeMapping = (dn: string) => (
    group: { id: number },
    selected: boolean,
  ) => {
    if (selected) {
      this.setState((prevState: State) => ({
        mappings: {
          ...prevState.mappings,
          [dn]: [...prevState.mappings[dn], group.id],
        },
      }));
    } else {
      this.setState((prevState: State) => ({
        mappings: {
          ...prevState.mappings,
          [dn]: prevState.mappings[dn].filter(id => id !== group.id),
        },
      }));
    }
  };

  _deleteMapping = (dn: string) => (e: Event) => {
    e.preventDefault();
    this.setState((prevState: State) => ({
      mappings: _.omit(prevState.mappings, dn),
    }));
  };

  _cancelClick = (e: Event) => {
    e.preventDefault();
    this.setState({ showEditModal: false, showAddRow: false });
  };

  _saveClick = (e: Event) => {
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
    const {
      showEditModal,
      showAddRow,
      groups,
      mappings,
      saveError,
    } = this.state;

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
                                    directory server. Membership to the Admin group can be granted through mappings, but will not be automatically removed as a
                                    failsafe measure.`}
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
                  {((Object.entries(mappings): any): Array<
                    [string, number[]],
                  >).map(([dn, ids]) => (
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

type AddMappingRowProps = {
  mappings: { [string]: number[] },
  onAdd?: (dn: string) => void,
  onCancel?: () => void,
  placeholder?: string,
};

type AddMappingRowState = {
  value: "",
};

class AddMappingRow extends React.Component {
  props: AddMappingRowProps;
  state: AddMappingRowState;

  constructor(props: AddMappingRowProps, context: any) {
    super(props, context);
    this.state = {
      value: "",
    };
  }

  _handleCancelClick = (e: Event) => {
    e.preventDefault();
    const { onCancel } = this.props;
    onCancel && onCancel();
    this.setState({ value: "" });
  };

  _handleAddClick = (e: Event) => {
    e.preventDefault();
    const { onAdd } = this.props;
    onAdd && onAdd(this.state.value);
    this.setState({ value: "" });
  };

  render() {
    const { value } = this.state;

    const isValid = value && this.props.mappings[value] === undefined;

    return (
      <tr>
        <td colSpan="3" style={{ padding: 0 }}>
          <div className="my2 pl1 p1 bordered border-brand rounded relative flex align-center">
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
              primary={!!isValid}
              disabled={!isValid}
              onClick={this._handleAddClick}
            >{t`Add`}</Button>
          </div>
        </td>
      </tr>
    );
  }
}

class MappingGroupSelect extends React.Component {
  props: {
    groups: Array<{ id: number }>,
    selectedGroups: number[],
    onGroupChange?: (group: { id: number }, selected: boolean) => void,
  };

  render() {
    const { groups, selectedGroups, onGroupChange } = this.props;

    if (!groups) {
      return <LoadingSpinner />;
    }

    const selected = selectedGroups.reduce(
      (g, id) => ({ ...g, [id]: true }),
      {},
    );

    return (
      <PopoverWithTrigger
        ref="popover"
        triggerElement={
          <div className="flex align-center">
            <span className="mr1 text-medium">
              <GroupSummary groups={groups} selectedGroups={selected} />
            </span>
            <Icon className="text-light" name="chevrondown" size={10} />
          </div>
        }
        triggerClasses="AdminSelectBorderless py1"
        sizeToFit
      >
        {groups.length > 0 ? (
          <GroupSelect
            groups={groups}
            selectedGroups={selected}
            onGroupChange={onGroupChange}
          />
        ) : (
          <span className="p1">{t`No mappable groups`}</span>
        )}
      </PopoverWithTrigger>
    );
  }
}

class MappingRow extends React.Component {
  props: {
    dn: string,
    groups: Array<{ id: number }>,
    selectedGroups: number[],
    onChange?: (group: { id: number }, selected: boolean) => void,
    onDelete?: (e: Event) => void,
  };

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
