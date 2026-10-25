import { useCallback } from "react";

import {
  skipToken,
  useGetDatabaseQuery,
  useListUserAttributesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { useDataPermissions } from "metabase/permissions";
import { parseIntParam } from "metabase/urls";
import {
  getImpersonationDraft,
  setImpersonationDraft,
} from "metabase-enterprise/advanced_permissions/drafts";
import type {
  ImpersonationModalParams,
  ImpersonationParams,
} from "metabase-enterprise/advanced_permissions/types";
import { getImpersonatedDatabaseId } from "metabase-enterprise/advanced_permissions/utils";
import { useGetImpersonationQuery } from "metabase-enterprise/api";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
  type UserAttributeKey,
} from "metabase-types/api";

import { ImpersonationModalView } from "./ImpersonationModalView";

const parseParams = (params: ImpersonationModalParams): ImpersonationParams => {
  // NaN preserves the pre-conversion parseInt behavior for the
  // route-guaranteed param
  const groupId = parseIntParam(params.groupId) ?? NaN;
  const databaseId = getImpersonatedDatabaseId(params);

  return {
    groupId,
    databaseId,
  };
};

export const ImpersonationModal = ({
  params,
  onClose,
}: ModalComponentProps) => {
  const { groupId, databaseId } = parseParams(params);

  const {
    data: database,
    isLoading: isDatabaseLoading,
    error,
  } = useGetDatabaseQuery(databaseId != null ? { id: databaseId } : skipToken);

  const { data: attributes } = useListUserAttributesQuery();
  const { drafts, updateDrafts, updateDataPermission } = useDataPermissions();
  const draftImpersonation = getImpersonationDraft(drafts, databaseId, groupId);

  const {
    data: impersonation,
    isLoading: isImpersonationLoading,
    error: impersonationError,
  } = useGetImpersonationQuery(
    { db_id: databaseId, group_id: groupId },
    { skip: Boolean(draftImpersonation) },
  );

  const selectedAttribute =
    draftImpersonation?.attribute ?? impersonation?.attribute;

  const handleSave = useCallback(
    (attribute: UserAttributeKey) => {
      updateDataPermission({
        groupId,
        permission: {
          type: DataPermissionType.ACCESS,
          permission: DataPermission.VIEW_DATA,
        },
        value: DataPermissionValue.IMPERSONATED,
        entityId: { databaseId },
        view: "group",
      });

      if (attribute !== selectedAttribute) {
        updateDrafts(
          setImpersonationDraft({
            attribute,
            db_id: databaseId,
            group_id: groupId,
          }),
        );
      }

      onClose();
    },
    [
      onClose,
      databaseId,
      groupId,
      selectedAttribute,
      updateDataPermission,
      updateDrafts,
    ],
  );

  const isLoading =
    isDatabaseLoading || isImpersonationLoading || !attributes || !database;

  if (isLoading) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ?? impersonationError}
      />
    );
  }

  return (
    <ImpersonationModalView
      selectedAttribute={selectedAttribute}
      attributes={attributes}
      database={database}
      onSave={handleSave}
      onCancel={onClose}
    />
  );
};
