import React, { useCallback } from "react";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { useMount } from "react-use";
import _ from "underscore";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { fetchAttributes } from "metabase-enterprise/sandboxes/actions";
import { getAttributes } from "metabase-enterprise/sandboxes/selectors";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import {
  ImpersonationModalParams,
  ImpersonationParams,
} from "metabase-enterprise/advanced_permissions/types";
import { getParentPath } from "metabase/hoc/ModalRoute";
import { useDatabaseQuery } from "metabase/common/hooks";
import { getImpersonation } from "metabase-enterprise/advanced_permissions/selectors";
import {
  fetchImpersonation,
  updateImpersonation,
} from "metabase-enterprise/advanced_permissions/reducer";
import { updateDataPermission } from "metabase/admin/permissions/permissions";
import { ImpersonationModalView } from "./ImpersonationModalView";

interface ImpersonationModalProps {
  params: ImpersonationModalParams;
  route: {
    path: string;
  };
}

const parseParams = (params: ImpersonationModalParams): ImpersonationParams => {
  const groupId = parseInt(params.groupId);
  const databaseId = parseInt(
    "databaseId" in params && params.databaseId != null
      ? params.databaseId
      : params.impersonatedDatabaseId,
  );

  return {
    groupId,
    databaseId,
  };
};

const Component = ({ route, params }: ImpersonationModalProps) => {
  const { groupId, databaseId } = parseParams(params);

  const {
    data: database,
    isLoading,
    error,
  } = useDatabaseQuery({
    id: databaseId,
  });

  const attributes = useSelector(getAttributes);
  const impersonation = useSelector(getImpersonation(databaseId, groupId));

  const dispatch = useDispatch();

  const close = useCallback(() => {
    dispatch(push(getParentPath(route, location)));
  }, [dispatch, route]);

  const handleSave = useCallback(
    attribute => {
      dispatch(
        updateDataPermission({
          groupId,
          permission: { type: "access", permission: "data" },
          value: "impersonated",
          entityId: { databaseId },
        }),
      );

      dispatch(
        updateImpersonation({
          attribute,
          db_id: databaseId,
          group_id: groupId,
        }),
      );
      close();
    },
    [close, databaseId, dispatch, groupId],
  );

  const handleCancel = useCallback(() => {
    dispatch(push(getParentPath(route, location)));
  }, [dispatch, route]);

  useMount(() => {
    dispatch(fetchAttributes());

    if (!impersonation) {
      dispatch(fetchImpersonation({ groupId, databaseId }));
    }
  });

  return (
    <LoadingAndErrorWrapper loading={isLoading || !attributes} error={error}>
      <ImpersonationModalView
        attributes={attributes}
        database={database!}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </LoadingAndErrorWrapper>
  );
};

export const ImpersonationModal = _.compose(withRouter)(Component);
