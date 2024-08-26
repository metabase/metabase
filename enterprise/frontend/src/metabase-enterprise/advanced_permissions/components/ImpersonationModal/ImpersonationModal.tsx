import { useCallback } from "react";
import { useSelector } from "react-redux";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { useAsyncFn, useMount } from "react-use";

import { updateDataPermission } from "metabase/admin/permissions/permissions";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import { useDatabaseQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { getParentPath } from "metabase/hoc/ModalRoute";
import { useDispatch } from "metabase/lib/redux";
import { updateImpersonation } from "metabase-enterprise/advanced_permissions/reducer";
import { getImpersonation } from "metabase-enterprise/advanced_permissions/selectors";
import type {
  AdvancedPermissionsStoreState,
  ImpersonationModalParams,
  ImpersonationParams,
} from "metabase-enterprise/advanced_permissions/types";
import { getImpersonatedDatabaseId } from "metabase-enterprise/advanced_permissions/utils";
import { ImpersonationApi } from "metabase-enterprise/services";
import { fetchUserAttributes } from "metabase-enterprise/shared/reducer";
import { getUserAttributes } from "metabase-enterprise/shared/selectors";
import type { Impersonation, UserAttribute } from "metabase-types/api";

import { ImpersonationModalView } from "./ImpersonationModalView";

interface ImpersonationModalProps {
  params: ImpersonationModalParams;
  route: {
    path: string;
  };
}

const parseParams = (params: ImpersonationModalParams): ImpersonationParams => {
  const groupId = parseInt(params.groupId);
  const databaseId = getImpersonatedDatabaseId(params);

  return {
    groupId,
    databaseId,
  };
};

const _ImpersonationModal = ({ route, params }: ImpersonationModalProps) => {
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

  const attributes = useSelector(getUserAttributes);
  const draftImpersonation = useSelector<
    AdvancedPermissionsStoreState,
    Impersonation | undefined
  >(getImpersonation(databaseId, groupId));

  const selectedAttribute =
    draftImpersonation?.attribute ?? impersonation?.attribute;

  const dispatch = useDispatch();

  const close = useCallback(() => {
    dispatch(push(getParentPath(route, location)));
  }, [dispatch, route]);

  const handleSave = useCallback(
    (attribute: UserAttribute) => {
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
    dispatch(push(getParentPath(route, location)));
  }, [dispatch, route]);

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

export const ImpersonationModal = withRouter(_ImpersonationModal);
