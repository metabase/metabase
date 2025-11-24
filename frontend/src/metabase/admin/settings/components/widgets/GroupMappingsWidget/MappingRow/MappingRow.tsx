import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import type {
  DeleteMappingModalValueType,
  GroupIds,
} from "metabase/admin/types";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import IconButtonWrapper from "metabase/common/components/IconButtonWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { isAdminGroup } from "metabase/lib/groups";
import { Icon, Tooltip } from "metabase/ui";
import type { GroupInfo } from "metabase-types/api";

import { DeleteGroupMappingModal } from "../DeleteGroupMappingModal/DeleteGroupMappingModal";
import Selectbox from "../GroupSelect";

import S from "./MappingRow.module.css";

type OnDeleteMappingType = (arg: {
  name: string;
  groupIdsToDelete?: GroupIds;
  onSuccess?: () => Promise<void>;
}) => void;

type MappingRowProps = {
  name: string;
  groups: GroupInfo[];
  selectedGroupIds: GroupIds;
  clearGroupMember: ({ id }: { id: number }) => void;
  deleteGroup: ({ id }: { id: number }) => void;
  onChange: (group: { id: number }, selected: boolean) => void;
  onDeleteMapping: OnDeleteMappingType;
};

export const MappingRow = ({
  name,
  groups,
  selectedGroupIds,
  clearGroupMember,
  deleteGroup,
  onChange,
  onDeleteMapping,
}: MappingRowProps) => {
  const [
    deleteGroupMappingModalOpened,
    { open: openDeleteGroupMappingModal, close: closeDeleteGroupMappingModal },
  ] = useDisclosure();
  const [
    deleteMappingModalOpened,
    { open: openDeleteMappingModal, close: closeDeleteMappingModal },
  ] = useDisclosure();

  // Mappings may receive group ids even from the back-end
  // if the groups themselves have been deleted.
  // Let's ensure this row works with the ones that exist.
  const selectedGroupIdsFromGroupsThatExist = selectedGroupIds.filter((id) =>
    _.findWhere(groups, { id: id }),
  );

  const handleConfirmDeleteMapping = (
    whatToDoAboutGroups: DeleteMappingModalValueType,
    groups: GroupIds,
  ) => {
    const onSuccess = getCallbackForGroupsAfterDeletingMapping(
      whatToDoAboutGroups,
      groups,
    );

    const groupIdsToDelete =
      whatToDoAboutGroups === "delete" ? selectedGroupIds : [];

    onDeleteMapping({ name, onSuccess, groupIdsToDelete });
  };

  const getCallbackForGroupsAfterDeletingMapping = (
    whatToDoAboutGroups: DeleteMappingModalValueType,
    groupIds: GroupIds,
  ): (() => Promise<void>) | undefined => {
    switch (whatToDoAboutGroups) {
      case "clear":
        return async () => {
          await Promise.all(
            groupIds.map(async (id) => {
              try {
                const group = groups.find((group) => group.id === id);
                if (group && !isAdminGroup(group)) {
                  await clearGroupMember({ id });
                }
              } catch (error) {
                console.error(error);
              }
            }),
          );
        };
      case "delete":
        return async () => {
          await Promise.all(
            groupIds.map(async (id) => {
              try {
                const group = groups.find((group) => group.id === id);
                if (group && !isAdminGroup(group)) {
                  await deleteGroup({ id });
                }
              } catch (error) {
                console.error(error);
              }
            }),
          );
        };
      default:
        return undefined;
    }
  };

  const firstGroupInMapping = groups.find(
    (group) => group.id === selectedGroupIdsFromGroupsThatExist[0],
  );

  const isMappingLinkedOnlyToAdminGroup =
    groups.length > 0 &&
    selectedGroupIdsFromGroupsThatExist.length === 1 &&
    firstGroupInMapping &&
    isAdminGroup(firstGroupInMapping);

  const shouldUseDeleteGroupMappingModal =
    selectedGroupIdsFromGroupsThatExist.length > 0 &&
    !isMappingLinkedOnlyToAdminGroup;

  return (
    <>
      <tr>
        <td>{name}</td>
        <td>
          <Selectbox
            groups={groups}
            selectedGroupIds={selectedGroupIdsFromGroupsThatExist}
            onGroupChange={onChange}
          />
        </td>
        <td className={AdminS.TableActions}>
          <div className={cx(CS.floatRight, CS.mr1)}>
            <Tooltip label={t`Remove mapping`} position="top">
              <IconButtonWrapper
                className={S.deleteMappingButton}
                onClick={() =>
                  shouldUseDeleteGroupMappingModal
                    ? openDeleteGroupMappingModal()
                    : openDeleteMappingModal()
                }
              >
                <Icon name="close" />
              </IconButtonWrapper>
            </Tooltip>
          </div>
        </td>
      </tr>
      <ConfirmModal
        opened={deleteMappingModalOpened}
        title={t`Delete this mapping?`}
        onClose={closeDeleteMappingModal}
        onConfirm={() => {
          onDeleteMapping({ name });
          closeDeleteMappingModal();
        }}
      />
      {deleteGroupMappingModalOpened && (
        <DeleteGroupMappingModal
          name={name}
          groupIds={selectedGroupIds}
          onHide={closeDeleteGroupMappingModal}
          onConfirm={handleConfirmDeleteMapping}
        />
      )}
    </>
  );
};
