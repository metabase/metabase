import React, { useCallback, useEffect } from "react";
import { withRouter } from "react-router";
import { useSelector } from "react-redux";
import { push } from "react-router-redux";
import { useDispatch } from "metabase/lib/redux";
import { fetchAttributes } from "metabase-enterprise/sandboxes/actions";
import { getAttributes } from "metabase-enterprise/sandboxes/selectors";
import Databases from "metabase/entities/databases";
import { State } from "metabase-types/store";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { RoleAttributeMappingModalParams } from "metabase-enterprise/advanced_permissions/types";
import { getParentPath } from "metabase/hoc/ModalRoute";
import RoleAttributeMappingModalView from "./RoleAttributeMappingModalView";

interface RoleAttributeMappingModalProps {
  params: RoleAttributeMappingModalParams;
  route: {
    path: string;
  };
}

const RoleAttributeMappingModal = ({
  params,
  route,
}: RoleAttributeMappingModalProps) => {
  const databaseId = parseInt(params.impersonatedDatabaseId);
  const attributes = useSelector(getAttributes);

  const database = useSelector((state: State) =>
    Databases.selectors.getObject(state, { entityId: databaseId }),
  );

  const dispatch = useDispatch();

  const handleSave = useCallback(() => {
    console.log("TODO: save");
  }, []);

  const handleCancel = useCallback(() => {
    dispatch(push(getParentPath(route, location)));
  }, [dispatch, route]);

  useEffect(() => {
    dispatch(fetchAttributes());
  }, [dispatch]);

  return (
    <LoadingAndErrorWrapper loading={!attributes || !database}>
      <RoleAttributeMappingModalView
        attributes={attributes}
        database={database}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </LoadingAndErrorWrapper>
  );
};

export default withRouter(RoleAttributeMappingModal);
