import { t } from "ttag";

import {
  skipToken,
  useGetGroupTableAccessPolicyQuery,
  useListUserAttributesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { getGroupsBasePath, useDataPermissions } from "metabase/permissions";
import { parseIntParam } from "metabase/urls";
import type { GroupTableAccessPolicy } from "metabase-types/api";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
} from "metabase-types/api";

import EditSandboxingModal from "../components/EditSandboxingModal";
import { setSandboxDraft } from "../drafts";
import { getPolicyKeyFromParams } from "../utils";

const EditSandboxingModalContainer = ({
  params,
  location,
  onClose,
}: ModalComponentProps) => {
  const { drafts, updateDrafts, updateDataPermission } = useDataPermissions();

  const groupId = parseIntParam(params.groupId);
  const tableId = parseIntParam(params.tableId);
  const databaseId = parseIntParam(params.databaseId);

  const {
    data: fetchedPolicy,
    isLoading: isPoliciesLoading,
    error: policiesError,
  } = useGetGroupTableAccessPolicyQuery(
    tableId == null || groupId == null
      ? skipToken
      : {
          group_id: groupId,
          table_id: tableId,
        },
  );

  const {
    data: attributes = [],
    isLoading: isAttributesLoading,
    error: attributesError,
  } = useListUserAttributesQuery();

  const draftPolicy =
    groupId != null && tableId != null
      ? drafts.sandboxes[getPolicyKeyFromParams({ groupId, tableId })]
      : undefined;

  if (groupId == null || tableId == null || databaseId == null) {
    return <LoadingAndErrorWrapper error={t`Invalid table id`} />;
  }

  const policy = draftPolicy ?? fetchedPolicy ?? undefined;

  const isLoading = isPoliciesLoading || isAttributesLoading;
  const error = policiesError || attributesError;

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  const handleSave = async (policy: GroupTableAccessPolicy) => {
    updateDrafts(setSandboxDraft(policy));
    updateDataPermission({
      groupId,
      entityId: { databaseId, schemaName: params.schemaName, tableId },
      permission: {
        type: DataPermissionType.ACCESS,
        permission: DataPermission.VIEW_DATA,
      },
      value: DataPermissionValue.SANDBOXED,
      view: location.pathname.startsWith(getGroupsBasePath())
        ? "group"
        : "database",
    });
    onClose();
  };

  return (
    <EditSandboxingModal
      policy={policy}
      attributes={attributes || []}
      params={{ groupId, tableId }}
      onCancel={onClose}
      onSave={handleSave}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditSandboxingModalContainer;
