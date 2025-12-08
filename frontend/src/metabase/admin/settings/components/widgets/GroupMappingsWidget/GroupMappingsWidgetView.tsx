import { useDisclosure } from "@mantine/hooks";
import { useField } from "formik";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { MappingsType } from "metabase/admin/types";
import { getErrorMessage } from "metabase/api/utils/errors";
import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { FormSwitch } from "metabase/forms";
import type { GenericErrorResponse } from "metabase/lib/errors/types";
import { isDefaultGroup } from "metabase/lib/groups";
import { Box, Button, Flex, Icon, Stack, Text, Tooltip } from "metabase/ui";
import type { EnterpriseSettingKey, GroupInfo } from "metabase-types/api";

import AddMappingRow from "./AddMappingRow";
import S from "./GroupMappingsWidget.module.css";
import { MappingRow } from "./MappingRow";

const groupIsMappable = (group: GroupInfo) => !isDefaultGroup(group);

const helpText = (mappingSetting: EnterpriseSettingKey) => {
  if (mappingSetting === "jwt-group-mappings") {
    return t`Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the directory server. If no mappings are defined, groups will automatically be assigned based on exactly matching names.`;
  }
  return t`Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the directory server. If a group isn't mapped, its membership won't be synced.`;
};

const noMappingText = (
  mappingSetting: EnterpriseSettingKey,
  syncSwitchValue: boolean,
) => {
  if (!syncSwitchValue) {
    return t`No mappings yet, group sync is not on`;
  }
  if (mappingSetting === "jwt-group-mappings") {
    return t`No mappings yet, groups will be automatically assigned by exactly matching names`;
  }
  return t`No mappings yet`;
};

type GroupMappingsWidgetViewProps = {
  groupHeading: string;
  groupPlaceholder: string;
  allGroups?: GroupInfo[];
  mappingSetting: EnterpriseSettingKey;
  deleteGroup: (args: { id: number }) => Promise<void>;
  clearGroupMember: (args: { id: number }) => Promise<void>;
  updateSetting: (args: { key: string; value: MappingsType }) => Promise<void>;
  mappings: MappingsType;
  settingKey: EnterpriseSettingKey;
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
  settingKey,
}: GroupMappingsWidgetViewProps) {
  const [showAddRow, { open: openAddRow, close: closeAddRow }] =
    useDisclosure();
  const [saveError, setSaveError] = useState<GenericErrorResponse | null>(null);

  const groups = allGroups.filter(groupIsMappable);

  const handleAddMapping = async (name: string) => {
    const mappingsPlusNewMapping = { ...mappings, [name]: [] };

    try {
      await updateSetting({
        key: mappingSetting,
        value: mappingsPlusNewMapping,
      });
      closeAddRow();
      setSaveError(null);
    } catch (error) {
      setSaveError(error as GenericErrorResponse);
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
        setSaveError(error as GenericErrorResponse);
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

      onSuccess?.();
      setSaveError(null);
    } catch (error) {
      setSaveError(error as GenericErrorResponse);
    }
  };

  const [{ value: groupSyncSwitchValue }] = useField(settingKey);

  return (
    <Stack w="100%" gap={0}>
      <Box className={S.root}>
        <Flex justify="space-between" align="center" className={S.header}>
          <Flex align="center" gap="sm">
            <Text
              fw={700}
              c="text-primary"
              lh={1.2}
            >{t`Synchronize Group Memberships`}</Text>
            <FormSwitch
              data-testid="group-sync-switch"
              name={settingKey}
              pr="sm"
            />
          </Flex>
          <Tooltip label={helpText(mappingSetting)} position="top" maw="20rem">
            <Flex align="center" lh={1.2} gap="sm" c="text-secondary">
              <Icon name="info" />
              <Text c="text-secondary" fw={700}>{t`About mappings`}</Text>
            </Flex>
          </Tooltip>
        </Flex>

        <Box>
          {!showAddRow && (
            <Button
              className={S.addMappingButton}
              variant="filled"
              size="sm"
              onClick={openAddRow}
            >
              {t`New mapping`}
            </Button>
          )}
          <AdminContentTable
            columnTitles={[
              <span key="name" className={S.tableColumn}>
                {groupHeading}
              </span>,
              <span key="groups" className={S.tableColumn}>
                {t`Groups`}
              </span>,
              "",
            ]}
          >
            {showAddRow && (
              <AddMappingRow
                mappings={mappings}
                placeholder={groupPlaceholder}
                onCancel={closeAddRow}
                onAdd={handleAddMapping}
              />
            )}
            {Object.keys(mappings).length === 0 && !showAddRow && (
              <tr>
                <td>&nbsp;</td>
                <td className={S.tableColumn}>
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
        </Box>
      </Box>
      {saveError && (
        <Text c="error" fw={700} m="sm">
          {getErrorMessage(saveError)}
        </Text>
      )}
    </Stack>
  );
}
