import { t } from "ttag";

import { GROUPS_BASE_PATH } from "metabase/admin/permissions/utils/urls";
import {
  skipToken,
  useGetGroupTableAccessPolicyQuery,
  useListUserAttributesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { useDispatch, useSelector } from "metabase/redux";
import { parseIntParam } from "metabase/urls";
import { getGroupTableAccessPolicy } from "metabase-enterprise/sandboxes/selectors";
import type { GroupTableAccessPolicy } from "metabase-types/api";

import { updatePolicy, updateTableSandboxingPermission } from "../actions";
import EditSandboxingModal from "../components/EditSandboxingModal";

const EditSandboxingModalContainer = ({
  params,
  location,
  onClose,
}: ModalComponentProps) => {
  const dispatch = useDispatch();

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

  const draftPolicy = useSelector((state) =>
    groupId != null && tableId != null
      ? getGroupTableAccessPolicy(state, { params: { groupId, tableId } })
      : undefined,
  );

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
    dispatch(updatePolicy(policy));
    dispatch(
      updateTableSandboxingPermission({
        groupId,
        entityId: { databaseId, schemaName: params.schemaName, tableId },
        // the modal is mounted under both permissions editor views; only
        // permission post-actions read the view
        view: location.pathname.startsWith(GROUPS_BASE_PATH)
          ? "group"
          : "database",
      }),
    );
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
