import type { Location } from "history";
import { useCallback } from "react";
import { push } from "react-router-redux";
import { useAsyncFn, useMount } from "react-use";

import { updateDataPermission } from "metabase/admin/permissions/permissions";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDatabaseQuery } from "metabase/common/hooks";
import { getParentPath } from "metabase/hoc/ModalRoute";
import { useDispatch } from "metabase/lib/redux";
import { useRouter } from "metabase/router";
import { updateImpersonation } from "metabase-enterprise/advanced_permissions/reducer";
import { getImpersonation } from "metabase-enterprise/advanced_permissions/selectors";
import type {
  ImpersonationModalParams,
  ImpersonationParams,
} from "metabase-enterprise/advanced_permissions/types";
import { getImpersonatedDatabaseId } from "metabase-enterprise/advanced_permissions/utils";
import { useEnterpriseSelector } from "metabase-enterprise/redux";
import { ImpersonationApi } from "metabase-enterprise/services";
import { fetchUserAttributes } from "metabase-enterprise/shared/reducer";
import { getUserAttributes } from "metabase-enterprise/shared/selectors";
import type { Impersonation, UserAttributeKey } from "metabase-types/api";

import { ImpersonationModalView } from "./ImpersonationModalView";

interface ImpersonationModalProps {
  params: ImpersonationModalParams;
}

const parseParams = (params: ImpersonationModalParams): ImpersonationParams => {
  const groupId = parseInt(params.groupId);
  const databaseId = getImpersonatedDatabaseId(params);

  return {
    groupId,
    databaseId,
  };
};

export const ImpersonationModal = ({ params }: ImpersonationModalProps) => {
  const { routes, location } = useRouter();
  const route = routes[routes.length - 1];
  const [
    {
      loading: isImpersonationLoading,
      value: impersonation,
      error: impersonationError,
    },
    fetchImpersonation,
  ] = useAsyncFn(
    async (
      groupId: number,
      databaseId: number,
    ): Promise<Impersonation | undefined> =>
      ImpersonationApi.get({
        db_id: databaseId,
        group_id: groupId,
      }),
    [],
  );

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

  const selectedAttribute =
    draftImpersonation?.attribute ?? impersonation?.attribute;

  const dispatch = useDispatch();
  const parentPath = route ? getParentPath(route, location as Location) : "/";

  const close = useCallback(() => {
    dispatch(push(parentPath));
  }, [dispatch, parentPath]);

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

      close();
    },
    [close, databaseId, dispatch, groupId, selectedAttribute],
  );

  const handleCancel = useCallback(() => {
    dispatch(push(parentPath));
  }, [dispatch, parentPath]);

  useMount(() => {
    dispatch(fetchUserAttributes());

    if (!draftImpersonation) {
      fetchImpersonation(groupId, databaseId);
    }
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
      onCancel={handleCancel}
    />
  );
};
