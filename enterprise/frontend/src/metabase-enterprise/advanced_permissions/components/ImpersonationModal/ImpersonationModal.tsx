import { useCallback } from "react";
import { useMount } from "react-use";

import { updateDataPermission } from "metabase/admin/permissions/permissions";
import { DataPermissionType } from "metabase/admin/permissions/types";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDatabaseQuery } from "metabase/common/hooks";
import type { ModalComponentProps } from "metabase/hoc/ModalRoute";
import { useDispatch } from "metabase/redux";
import { parseIntParam } from "metabase/urls";
import { updateImpersonation } from "metabase-enterprise/advanced_permissions/reducer";
import { getImpersonation } from "metabase-enterprise/advanced_permissions/selectors";
import type {
  ImpersonationModalParams,
  ImpersonationParams,
} from "metabase-enterprise/advanced_permissions/types";
import { getImpersonatedDatabaseId } from "metabase-enterprise/advanced_permissions/utils";
import { useGetImpersonationQuery } from "metabase-enterprise/api";
import { useEnterpriseSelector } from "metabase-enterprise/redux";
import { fetchUserAttributes } from "metabase-enterprise/shared/reducer";
import { getUserAttributes } from "metabase-enterprise/shared/selectors";
import {
  DataPermission,
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
  } = useDatabaseQuery({
    id: databaseId,
  });

  const attributes = useEnterpriseSelector(getUserAttributes);
  const draftImpersonation = useEnterpriseSelector(
    getImpersonation(databaseId, groupId),
  );

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

  const dispatch = useDispatch();

  const handleSave = useCallback(
    (attribute: UserAttributeKey) => {
      dispatch(
        updateDataPermission({
          groupId,
          permission: {
            type: DataPermissionType.ACCESS,
            permission: DataPermission.VIEW_DATA,
          },
          value: DataPermissionValue.IMPERSONATED,
          entityId: { databaseId },
          view: "group",
        }),
      );

      if (attribute !== selectedAttribute) {
        dispatch(
          updateImpersonation({
            attribute,
            db_id: databaseId,
            group_id: groupId,
          }),
        );
      }

      onClose();
    },
    [onClose, databaseId, dispatch, groupId, selectedAttribute],
  );

  useMount(() => {
    dispatch(fetchUserAttributes());
  });

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
