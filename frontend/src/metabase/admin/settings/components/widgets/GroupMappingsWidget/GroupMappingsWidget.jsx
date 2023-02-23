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
  GroupMappingsWidgetAndErrorRoot as WidgetAndErrorRoot,
  GroupMappingsWidgetRoot as Root,
  GroupMappingsWidgetHeader as Header,
  GroupMappingsWidgetToggleRoot as ToggleRoot,
  GroupMappingsWidgetAbout as About,
  GroupMappingsWidgetAboutContentRoot as AboutContentRoot,
  AddMappingButton,
} from "./GroupMappingsWidget.styled";
import MappingRow from "./MappingRow";

const groupIsMappable = group => !isDefaultGroup(group);

const loadGroupsAndMappings = async mappingSetting => {
  const [settings, groupsIncludingDefaultGroup] = await Promise.all([
    SettingsApi.list(),
    PermissionsApi.groups(),
  ]);

  const setting = _.findWhere(settings, {
    key: mappingSetting,
  });

  return {
    groups: groupsIncludingDefaultGroup.filter(groupIsMappable),
    mappings: setting?.value || {},
  };
};

function GroupMappingsWidget({ mappingSetting, ...props }) {
  const [showAddRow, setShowAddRow] = useState(false);
  const [groups, setGroups] = useState([]);
  const [mappings, setMappings] = useState({});
  const [saveError, setSaveError] = useState({});

  useEffect(() => {
    async function fetchData() {
      const { groups, mappings } = await loadGroupsAndMappings(mappingSetting);

      setMappings(mappings);
      setGroups(groups);
    }

    fetchData();
  }, [mappingSetting]);

  const handleShowAddRow = () => {
    setShowAddRow(true);
  };

  const handleHideAddRow = () => {
    setShowAddRow(false);
  };

  const handleAddMapping = name => {
    const mappingsPlusNewMapping = { ...mappings, [name]: [] };

    SettingsApi.put({
      key: mappingSetting,
      value: mappingsPlusNewMapping,
    }).then(
      () => {
        props.onChangeSetting(mappingSetting, mappingsPlusNewMapping);

        setMappings(mappingsPlusNewMapping);
        setShowAddRow(false);
        setSaveError(null);
      },
      e => setSaveError(e),
    );
  };

  const handleChangeMapping = name => (group, selected) => {
    const updatedMappings = selected
      ? { ...mappings, [name]: [...mappings[name], group.id] }
      : {
          ...mappings,
          [name]: mappings[name].filter(id => id !== group.id),
        };

    SettingsApi.put({
      key: mappingSetting,
      value: updatedMappings,
    }).then(
      () => {
        props.onChangeSetting(mappingSetting, updatedMappings);
        setMappings(updatedMappings);

        setSaveError(null);
      },
      e => setSaveError(e),
    );
  };

  const handleDeleteMapping = ({ name, onSuccess, groupIdsToDelete = [] }) => {
    const mappingsMinusDeletedMapping = _.omit(mappings, name);

    SettingsApi.put({
      key: mappingSetting,
      value: mappingsMinusDeletedMapping,
    }).then(
      async () => {
        props.onChangeSetting(mappingSetting, mappingsMinusDeletedMapping);

        onSuccess && (await onSuccess());

        const { groups, mappings } = await loadGroupsAndMappings(
          mappingSetting,
        );

        setGroups(groups);
        setMappings(mappings);
        setSaveError(null);
      },
      e => setSaveError(e),
    );
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
            <AdminContentTable
              columnTitles={[props.groupHeading, t`Groups`, ""]}
            >
              {showAddRow && (
                <AddMappingRow
                  mappings={mappings}
                  placeholder={props.groupPlaceholder}
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
                return groups.length > 0 ? (
                  <MappingRow
                    key={name}
                    name={name}
                    groups={groups}
                    selectedGroupIds={selectedGroupIds}
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

export default GroupMappingsWidget;
