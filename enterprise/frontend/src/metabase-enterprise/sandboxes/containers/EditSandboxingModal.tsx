import type { Location } from "history";
import { push } from "react-router-redux";

import {
  useListGroupTableAccessPoliciesQuery,
  useListUserAttributesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getParentPath } from "metabase/hoc/ModalRoute";
import { useDispatch, useSelector } from "metabase/redux";
import { parseIntParam } from "metabase/utils/urls";
import { getGroupTableAccessPolicy } from "metabase-enterprise/sandboxes/selectors";
import type { GroupTableAccessPolicy } from "metabase-types/api";

import { updatePolicy, updateTableSandboxingPermission } from "../actions";
import EditSandboxingModal from "../components/EditSandboxingModal";
import type { GroupTableAccessPolicyParams, SandboxesState } from "../types";

interface EditSandboxingModalContainerProps {
  params: GroupTableAccessPolicyParams;
  location: Location;
  route: { path: string };
}

const EditSandboxingModalContainer = ({
  params,
  location,
  route,
}: EditSandboxingModalContainerProps) => {
  const dispatch = useDispatch();

  const groupId = parseIntParam(params.groupId);
  const tableId = parseIntParam(params.tableId);

  const {
    data: policies,
    isLoading: isPoliciesLoading,
    error: policiesError,
  } = useListGroupTableAccessPoliciesQuery({
    group_id: groupId,
    table_id: tableId,
  });

  const { data: attributes } = useListUserAttributesQuery();

  // The plugins state is added dynamically by the enterprise plugin system,
  // so we need to cast to SandboxesState (same approach as the old connect-based mapStateToProps).
  const draftPolicy = useSelector((state) =>
    getGroupTableAccessPolicy(state as unknown as SandboxesState, { params }),
  );

  const fetchedPolicy = policies?.[0];
  const policy = draftPolicy ?? fetchedPolicy;

  const isLoading = isPoliciesLoading || !attributes;

  if (policiesError) {
    return <LoadingAndErrorWrapper error={policiesError} />;
  }

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  const close = () => {
    return dispatch(push(getParentPath(route, location)));
  };

  const handleSave = async (policy: GroupTableAccessPolicy) => {
    dispatch(updatePolicy(policy));
    dispatch(updateTableSandboxingPermission(params));
    close();
  };

  return (
    <EditSandboxingModal
      policy={policy}
      attributes={attributes || []}
      params={params}
      onCancel={close}
      onSave={handleSave}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditSandboxingModalContainer;
