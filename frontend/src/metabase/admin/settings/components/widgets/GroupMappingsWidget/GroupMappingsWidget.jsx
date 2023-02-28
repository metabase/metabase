/* eslint-disable react/prop-types */
import React, { useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { updateSetting } from "metabase/admin/settings/settings";
import AdminContentTable from "metabase/components/AdminContentTable";
import Group from "metabase/entities/groups";
import { isDefaultGroup } from "metabase/lib/groups";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import { getSetting } from "metabase/selectors/settings";

import SettingToggle from "../SettingToggle";
import AddMappingRow from "./AddMappingRow";
import {
  GroupMappingsWidgetAndErrorRoot as WidgetAndErrorRoot,
  GroupMappingsWidgetRoot as Root,
  GroupMappingsWidgetHeader as Header,
  GroupMappingsWidgetToggleRoot as ToggleRoot,
  GroupMappingsWidgetAbout as About,
  GroupMappingsWidgetAboutContentRoot as AboutContentRoot,
  AddMappingButton,
} from "./GroupMappingsWidget.styled";
import MappingRow from "./MappingRow";

const mapStateToProps = (state, props) => {
  return {
    allGroups: Group.selectors.getList(state),
    mappings: getSetting(state, props.mappingSetting) || {},
  };
};

const mapDispatchToProps = {
  updateSetting,
  deleteGroup: Group.actions.delete,
  clearGroupMember: Group.actions.clearMember,
};

const groupIsMappable = group => !isDefaultGroup(group);

function GroupMappingsWidget({
  groupHeading,
  groupPlaceholder,
  allGroups = [],
  mappingSetting,
  deleteGroup,
  clearGroupMember,
  updateSetting,
  mappings,
  ...props
}) {
  const [showAddRow, setShowAddRow] = useState(false);
  const [saveError, setSaveError] = useState({});

  const groups = allGroups.filter(groupIsMappable);

  const handleShowAddRow = () => {
    setShowAddRow(true);
  };

  const handleHideAddRow = () => {
    setShowAddRow(false);
  };

  const handleAddMapping = async name => {
    const mappingsPlusNewMapping = { ...mappings, [name]: [] };

    try {
      await updateSetting({
        key: mappingSetting,
        value: mappingsPlusNewMapping,
      });
      setShowAddRow(false);
      setSaveError(null);
    } catch (error) {
      setSaveError(error);
    }
  };

  const handleChangeMapping = name => async (group, selected) => {
    const updatedMappings = selected
      ? { ...mappings, [name]: [...mappings[name], group.id] }
      : {
          ...mappings,
          [name]: mappings[name].filter(id => id !== group.id),
        };

    try {
      await updateSetting({ key: mappingSetting, value: updatedMappings });
      setSaveError(null);
    } catch (error) {
      setSaveError(error);
    }
  };

  const handleDeleteMapping = async ({
    name,
    onSuccess,
    groupIdsToDelete = [],
  }) => {
    const mappingsMinusDeletedMapping = _.omit(mappings, name);

    try {
      await updateSetting({
        key: mappingSetting,
        value: mappingsMinusDeletedMapping,
      });

      onSuccess && (await onSuccess());
      setSaveError(null);
    } catch (error) {
      setSaveError(error);
    }
  };

  return (
    <WidgetAndErrorRoot>
      <Root>
        <Header>
          <ToggleRoot>
            <span>{t`Synchronize Group Memberships`}</span>
            <SettingToggle {...props} hideLabel />
          </ToggleRoot>
          <About>
            <Tooltip
              tooltip={t`Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the directory server. If a group isn‘t mapped, its membership won‘t be synced.`}
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
            {!showAddRow && (
              <AddMappingButton primary small onClick={handleShowAddRow}>
                {t`New mapping`}
              </AddMappingButton>
            )}
            <AdminContentTable columnTitles={[groupHeading, t`Groups`, ""]}>
              {showAddRow && (
                <AddMappingRow
                  mappings={mappings}
                  placeholder={groupPlaceholder}
                  onCancel={handleHideAddRow}
                  onAdd={handleAddMapping}
                />
              )}
              {Object.keys(mappings).length === 0 && !showAddRow && (
                <tr>
                  <td>&nbsp;</td>
                  <td> {t`No mappings yet`}</td>
                  <td>&nbsp;</td>
                </tr>
              )}
              {Object.entries(mappings).map(([name, selectedGroupIds]) => {
                return groups?.length > 0 ? (
                  <MappingRow
                    key={name}
                    name={name}
                    groups={groups}
                    selectedGroupIds={selectedGroupIds}
                    clearGroupMember={clearGroupMember}
                    deleteGroup={deleteGroup}
                    onChange={handleChangeMapping(name)}
                    onDeleteMapping={handleDeleteMapping}
                  />
                ) : null;
              })}
            </AdminContentTable>
          </div>
        </div>
      </Root>
      {saveError?.data?.message && (
        <div className="text-error text-bold m1">{saveError.data.message}</div>
      )}
    </WidgetAndErrorRoot>
  );
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(GroupMappingsWidget);
