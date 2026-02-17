import cx from "classnames";
import { useField } from "formik";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import CS from "metabase/css/core/index.css";
import { FormSwitch } from "metabase/forms";
import { isDefaultGroup } from "metabase/lib/groups";
import { Icon, Tooltip } from "metabase/ui";
import type { Group, GroupId } from "metabase-types/api";

import AddMappingRow from "./AddMappingRow";
import {
  GroupMappingsWidgetAbout as About,
  GroupMappingsWidgetAboutContentRoot as AboutContentRoot,
  AddMappingButton,
  GroupMappingsWidgetHeader as Header,
  GroupMappingsWidgetRoot as Root,
  GroupMappingsWidgetToggleRoot as ToggleRoot,
  GroupMappingsWidgetAndErrorRoot as WidgetAndErrorRoot,
} from "./GroupMappingsWidget.styled";
import { MappingRow } from "./MappingRow";

const groupIsMappable = (group: Group) => !isDefaultGroup(group);

const helpText = (mappingSetting: string) => {
  if (mappingSetting === "jwt-group-mappings") {
    return t`Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the directory server. If no mappings are defined, groups will automatically be assigned based on exactly matching names.`;
  }
  return t`Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the directory server. If a group isn‘t mapped, its membership won‘t be synced.`;
};

const noMappingText = (mappingSetting: string, syncSwitchValue: boolean) => {
  if (!syncSwitchValue) {
    return `No mappings yet, group sync is not on`;
  }
  if (mappingSetting === "jwt-group-mappings") {
    return t`No mappings yet, groups will be automatically assigned by exactly matching names`;
  }
  return t`No mappings yet`;
};

interface GroupMappingsWidgetViewProps {
  groupHeading: string;
  groupPlaceholder: string;
  allGroups: Group[];
  mappingSetting: string; // seems like this should be SettingKey but we pass in values like "jwt-group-mappings"
  deleteGroup: ({ id }: { id: number }) => void;
  clearGroupMember: ({ id }: { id: number }) => void;
  updateSetting: ({
    key,
    value,
  }: {
    key: string;
    value: Record<string, GroupId[]>;
  }) => void;
  mappings: Record<string, GroupId[]>;
  setting: { key: string };
}

export function GroupMappingsWidgetView({
  groupHeading,
  groupPlaceholder,
  allGroups = [],
  mappingSetting,
  deleteGroup,
  clearGroupMember,
  updateSetting,
  mappings,
  setting,
}: GroupMappingsWidgetViewProps) {
  const [showAddRow, setShowAddRow] = useState(false);
  const [saveError, setSaveError] = useState<any>({});

  const groups = allGroups.filter(groupIsMappable);

  const handleShowAddRow = () => {
    setShowAddRow(true);
  };

  const handleHideAddRow = () => {
    setShowAddRow(false);
  };

  const handleAddMapping = async (name: string) => {
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

  const handleChangeMapping =
    (name: string) => async (group: { id: GroupId }, selected: boolean) => {
      const updatedMappings = selected
        ? { ...mappings, [name]: [...mappings[name], group.id] }
        : {
            ...mappings,
            [name]: mappings[name].filter((id) => id !== group.id),
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
  }: {
    name: string;
    onSuccess?: () => void;
  }) => {
    const mappingsMinusDeletedMapping = _.omit(mappings, name);

    try {
      await updateSetting({
        key: mappingSetting,
        value: mappingsMinusDeletedMapping,
      });

      if (onSuccess) {
        await onSuccess();
      }
      setSaveError(null);
    } catch (error) {
      setSaveError(error);
    }
  };

  const [{ value: groupSyncSwitchValue }] = useField<boolean>(setting.key);

  return (
    <WidgetAndErrorRoot>
      <Root>
        <Header>
          <ToggleRoot>
            <span>{t`Synchronize Group Memberships`}</span>
            <FormSwitch data-testid="group-sync-switch" name={setting.key} />
          </ToggleRoot>
          <About>
            <Tooltip
              label={helpText(mappingSetting)}
              position="top"
              maw="20rem"
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
                  <td>
                    {" "}
                    {noMappingText(mappingSetting, groupSyncSwitchValue)}
                  </td>
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
        <div className={cx(CS.textError, CS.textBold, CS.m1)}>
          {saveError.data.message}
        </div>
      )}
    </WidgetAndErrorRoot>
  );
}
