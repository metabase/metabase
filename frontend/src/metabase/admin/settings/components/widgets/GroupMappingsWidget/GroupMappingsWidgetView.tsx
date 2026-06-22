import { useField } from "formik";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import NoResults from "assets/img/no_results.svg";
import { AdminContentTable } from "metabase/admin/components/AdminContentTable";
import { isDefaultGroup } from "metabase/admin/utils/groups";
import { getErrorMessage } from "metabase/api/utils/errors";
import { EmptyState } from "metabase/common/components/EmptyState";
import { useToast } from "metabase/common/hooks";
import { FormSwitch } from "metabase/forms";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Text,
  Tooltip,
  rem,
} from "metabase/ui";
import type { GroupId, GroupInfo } from "metabase-types/api";

import { AddMappingRow } from "./AddMappingRow";
import S from "./GroupMappingsWidget.module.css";
import { MappingRow } from "./MappingRow";

const groupIsMappable = (group: GroupInfo) => !isDefaultGroup(group);

const helpText = (mappingSetting: string) => {
  if (mappingSetting === "jwt-group-mappings") {
    return t`Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the directory server. If no mappings are defined, groups will automatically be assigned based on exactly matching names.`;
  }
  return t`Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the directory server. If a group isn‘t mapped, its membership won‘t be synced.`;
};

const noMappingText = (mappingSetting: string, syncSwitchValue: boolean) => {
  if (!syncSwitchValue) {
    return t`No mappings yet, group sync is not on`;
  }
  if (mappingSetting === "jwt-group-mappings") {
    return t`No mappings yet, groups will be automatically assigned by exactly matching names`;
  }
  return t`No mappings yet`;
};

interface GroupMappingsWidgetViewProps {
  groupHeading: string;
  groupPlaceholder: string;
  allGroups: GroupInfo[];
  mappingSetting: string; // seems like this should be SettingKey but we pass in values like "jwt-group-mappings"
  deleteGroup: ({ id }: { id: number }) => Promise<void>;
  clearGroupMember: ({ id }: { id: number }) => Promise<void>;
  updateSetting: ({
    key,
    value,
  }: {
    key: string;
    value: Record<string, GroupId[]>;
  }) => Promise<void>;
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sendToast] = useToast();

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
      sendToast({ message: t`Mapping added`, icon: "check" });
    } catch (error) {
      setSaveError(getErrorMessage(error));
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
        sendToast({ message: t`Mapping updated`, icon: "check" });
      } catch (error) {
        setSaveError(getErrorMessage(error));
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
      sendToast({ message: t`Mapping deleted`, icon: "check" });
    } catch (error) {
      setSaveError(getErrorMessage(error));
    }
  };

  const [{ value: groupSyncSwitchValue }] = useField<boolean>(setting.key);

  const hasMappings = Object.keys(mappings).length > 0;

  return (
    <Flex direction="column" w="100%">
      <Group mb="md" gap="sm">
        <Text fw="bold">{t`Synchronize Group Memberships`}</Text>
        <FormSwitch data-testid="group-sync-switch" name={setting.key} />
      </Group>

      <Flex
        bd="1px solid var(--mb-color-border-neutral)"
        bdrs="md"
        direction="column"
        w="100%"
      >
        <Flex
          className={S.header}
          align="center"
          bg="background-secondary"
          mih={rem(56)}
          px="md"
          py="sm"
        >
          {!showAddRow && (
            <Button
              variant="filled"
              size="sm"
              type="button"
              onClick={handleShowAddRow}
            >
              {t`New mapping`}
            </Button>
          )}
          <Tooltip label={helpText(mappingSetting)} position="top" maw="20rem">
            <Flex align="center" gap="sm" c="text-secondary" ml="auto">
              <Icon name="info" />
              <span>{t`About mappings`}</span>
            </Flex>
          </Tooltip>
        </Flex>

        {showAddRow && (
          <AddMappingRow
            mappings={mappings}
            placeholder={groupPlaceholder}
            onCancel={handleHideAddRow}
            onAdd={handleAddMapping}
          />
        )}
        {hasMappings ? (
          <AdminContentTable
            className={S.mappingsTable}
            columnTitles={[groupHeading, t`Groups`, ""]}
          >
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
        ) : (
          !showAddRow && (
            <Box pb="md">
              <EmptyState
                illustrationElement={<img src={NoResults} alt="" />}
                message={noMappingText(mappingSetting, groupSyncSwitchValue)}
                spacing="sm"
              />
            </Box>
          )
        )}
      </Flex>
      {saveError && (
        <Text c="error" fw="bold" m="sm">
          {saveError}
        </Text>
      )}
    </Flex>
  );
}
