import React, { useCallback } from "react";
import { withRouter } from "react-router";
import { useSelector } from "react-redux";
import { push } from "react-router-redux";
import { useMount } from "react-use";
import _ from "underscore";
import { useDispatch } from "metabase/lib/redux";
import { fetchAttributes } from "metabase-enterprise/sandboxes/actions";
import { getAttributes } from "metabase-enterprise/sandboxes/selectors";
import Databases from "metabase/entities/databases";
import { State } from "metabase-types/store";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { RoleAttributeMappingModalParams } from "metabase-enterprise/advanced_permissions/types";
import { getParentPath } from "metabase/hoc/ModalRoute";
import { Database } from "metabase-types/api";
import RoleAttributeMappingModalView from "./RoleAttributeMappingModalView";

interface OwnProps {
  params: RoleAttributeMappingModalParams;
  route: {
    path: string;
  };
}
interface StateProps {
  database: Database;
}

type RoleAttributeMappingModalProps = OwnProps & StateProps;

const RoleAttributeMappingModal = ({
  route,
  database,
}: RoleAttributeMappingModalProps) => {
  const attributes = useSelector(getAttributes);

  const dispatch = useDispatch();

  const handleSave = useCallback(() => {
    console.log("TODO: save");
  }, []);

  const handleCancel = useCallback(() => {
    dispatch(push(getParentPath(route, location)));
  }, [dispatch, route]);

  useMount(() => {
    dispatch(fetchAttributes());
  });

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

export default _.compose(
  Databases.load({
    id: (_state: State, { params }: OwnProps) =>
      parseInt(params.impersonatedDatabaseId),
  }),
  withRouter,
)(RoleAttributeMappingModal);
