import { useCallback, useState } from "react";
import { t } from "ttag";

import { getAuxiliaryConnectionId } from "metabase/admin/databases/utils";
import { skipToken } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import { Box, Button, Flex, Icon, Menu, Modal, Text } from "metabase/ui";
import {
  useDeleteAuxiliaryConnectionMutation,
  useGetAuxiliaryConnectionInfoQuery,
  useUpdateAuxiliaryConnectionMutation,
} from "metabase-enterprise/api/auxilary-connections";
import type {
  AuxiliaryConnectionType,
  Database,
  DatabaseData,
} from "metabase-types/api";

import { Label } from "./Label";

const DATABASE_FORM_CONFIG = {
  isAdvanced: true,
  engine: {
    fieldState: "disabled",
  },
  advancedOptions: {
    fieldState: "hidden",
  },
} as const;

export function AuxiliaryConnectionEditor({
  database,
  type,
  title,
  description,
}: {
  database: Database;
  type: AuxiliaryConnectionType;
  title: string;
  description: string;
}) {
  const configured = getAuxiliaryConnectionId(type, database) != null;

  const [sendToast] = useToast();
  const { data: info, isLoading } = useGetAuxiliaryConnectionInfoQuery(
    configured
      ? {
          type,
          id: database.id,
        }
      : skipToken,
  );
  const [updateAuxiliaryConnection] = useUpdateAuxiliaryConnectionMutation();
  const [deleteAuxiliaryConnection] = useDeleteAuxiliaryConnectionMutation();

  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);

  const toggleConnectionModal = useCallback(() => {
    setIsConnectionModalOpen((isOpen) => !isOpen);
  }, []);

  const closeConnectionModal = useCallback(() => {
    setIsConnectionModalOpen(false);
  }, []);

  const initialDetails = info?.configured ? info.details : undefined;

  const handleSubmit = useCallback(
    async function (details: DatabaseData) {
      try {
        const { status } = await updateAuxiliaryConnection({
          id: database.id,
          type,
          name: type, // TODO: it's unclear why the API let's use set a custom name
          details: details as unknown as Record<string, unknown>,
        }).unwrap();

        closeConnectionModal();
        sendToast({
          message:
            status === "updated"
              ? t`Connection details updated`
              : t`Auxiliary connection enabled`,
        });
      } catch (error) {
        sendToast({
          message: t`Failed to update auxiliary connection`,
        });
      }
    },
    [
      closeConnectionModal,
      database.id,
      sendToast,
      type,
      updateAuxiliaryConnection,
    ],
  );

  const handleDelete = useCallback(async () => {
    try {
      deleteAuxiliaryConnection({ id: database.id, type }).unwrap();
    } catch (error) {
      sendToast({
        message: t`Failed to delete auxiliary connection`,
      });
    }
  }, [database.id, type, sendToast, deleteAuxiliaryConnection]);

  return (
    <Flex direction="row" gap="sm" align="center" justify="space-between">
      <Box>
        <Flex direction="row" align="center" justify="start">
          <Label>{title}</Label>
          {configured && (
            <Flex gap="xs" direction="row" align="center" justify="start">
              <Icon name="check_filled" c="saturated-green" ml="sm" />
              <Text c="saturated-green">{t`Configured`}</Text>
            </Flex>
          )}
        </Flex>
        <Text c="text-secondary" mt="xs">
          {description}
        </Text>
      </Box>
      <Box>
        <Button.Group>
          <Button disabled={isLoading} onClick={toggleConnectionModal}>
            {configured ? t`Edit` : t`Configure`}
          </Button>
          {configured && (
            <Menu position="bottom-end">
              <Menu.Target>
                <Button leftSection={<Icon name="chevrondown" />} />
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<Icon name="trash" />}
                  onClick={handleDelete}
                >
                  {t`Delete`}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Button.Group>
      </Box>
      {isConnectionModalOpen && !isLoading && (
        <Modal
          title={t`Edit connection details`}
          opened
          onClose={closeConnectionModal}
        >
          <DatabaseForm
            location="full-page"
            config={DATABASE_FORM_CONFIG}
            initialValues={initialDetails}
            onCancel={closeConnectionModal}
            onSubmit={handleSubmit}
          />
        </Modal>
      )}
    </Flex>
  );
}
