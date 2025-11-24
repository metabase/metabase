import { useField } from "formik";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { MappingsType, UserGroupsType } from "metabase/admin/types";
import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { FormSwitch } from "metabase/forms";
import { isDefaultGroup } from "metabase/lib/groups";
import { Button, Flex, Icon, Stack, Text, Tooltip } from "metabase/ui";

import AddMappingRow from "./AddMappingRow";
import S from "./GroupMappingsWidget.module.css";
import { MappingRow } from "./MappingRow";

const groupIsMappable = (group: { name: string }) => !isDefaultGroup(group);

const helpText = (mappingSetting: string) => {
  if (mappingSetting === "jwt-group-mappings") {
    return t`Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the directory server. If no mappings are defined, groups will automatically be assigned based on exactly matching names.`;
  }
  return t`Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the directory server. If a group isn't mapped, its membership won't be synced.`;
};

const noMappingText = (mappingSetting: string, syncSwitchValue: boolean) => {
  if (!syncSwitchValue) {
    return `No mappings yet, group sync is not on`;
  }
  if (mappingSetting === "jwt-group-mappings") {
    return t`No mappings yet, groups will be automatically assgined by exactly matching names`;
  }
  return t`No mappings yet`;
};

type SettingType = {
  key: string;
};

type SaveError = {
  data?: {
    message?: string;
  };
} | null;

type GroupMappingsWidgetViewProps = {
  groupHeading: string;
  groupPlaceholder: string;
  allGroups?: UserGroupsType;
  mappingSetting: string;
  deleteGroup: (args: { id: number }) => Promise<void>;
  clearGroupMember: (args: { id: number }) => Promise<void>;
  updateSetting: (args: { key: string; value: MappingsType }) => Promise<void>;
  mappings: MappingsType;
  setting: SettingType;
};

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
  const [saveError, setSaveError] = useState<SaveError>({});

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
      setSaveError(error as SaveError);
    }
  };

  const handleChangeMapping =
    (name: string) => async (group: { id: number }, selected: boolean) => {
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
        setSaveError(error as SaveError);
      }
    };

  const handleDeleteMapping = async ({
    name,
    onSuccess,
  }: {
    name: string;
    onSuccess?: () => Promise<void>;
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
      setSaveError(error as SaveError);
    }
  };

  const [{ value: groupSyncSwitchValue }] = useField(setting.key);

  return (
    <Stack w="100%" gap={0}>
      <div className={S.root}>
        <Flex justify="space-between" align="center" className={S.header}>
          <Flex align="center" gap="sm">
            <Text
              fw={700}
              c="text-dark"
              lh={1.2}
            >{t`Synchronize Group Memberships`}</Text>
            <FormSwitch
              data-testid="group-sync-switch"
              name={setting.key}
              pr="sm"
            />
          </Flex>
          <Tooltip label={helpText(mappingSetting)} position="top" maw="20rem">
            <Flex align="center" lh={1.2} gap="sm" c="text-medium">
              <Icon name="info" />
              <Text c="text-medium" fw={700}>{t`About mappings`}</Text>
            </Flex>
          </Tooltip>
        </Flex>

        <div>
          {!showAddRow && (
            <Button
              className={S.addMappingButton}
              variant="filled"
              size="sm"
              onClick={handleShowAddRow}
            >
              {t`New mapping`}
            </Button>
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
                <td>{noMappingText(mappingSetting, groupSyncSwitchValue)}</td>
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
      {saveError?.data?.message && (
        <Text c="error" fw={700} m="sm">
          {saveError.data.message}
        </Text>
      )}
    </Stack>
  );
}
