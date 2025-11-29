import { useEffect } from "react";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import _ from "underscore";

import { useListUserAttributesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getParentPath } from "metabase/hoc/ModalRoute";
import { connect } from "metabase/lib/redux";
import {
  getGroupTableAccessPolicy,
  getPolicyRequestState,
} from "metabase-enterprise/sandboxes/selectors";
import { fetchUserAttributes } from "metabase-enterprise/shared/reducer";
import { getUserAttributes } from "metabase-enterprise/shared/selectors";
import type {
  GroupTableAccessPolicy,
  UserAttributeKey,
} from "metabase-types/api";

import {
  fetchPolicy,
  updatePolicy,
  updateTableSandboxingPermission,
} from "../actions";
import { EditSandboxingModal } from "../components/EditSandboxingModal";
import type { GroupTableAccessPolicyParams, SandboxesState } from "../types";

interface EditSandboxingModalContainerProps {
  policy: GroupTableAccessPolicy;
  attributes: UserAttributeKey[];
  push: (path: string) => void;
  params: GroupTableAccessPolicyParams;
  route: any;
  location: any;
  policyRequestState: any;
  fetchPolicy: (params: GroupTableAccessPolicyParams) => void;
  fetchUserAttributes: () => void;
  updatePolicy: (policy: GroupTableAccessPolicy) => void;
  updateTableSandboxingPermission: (
    params: GroupTableAccessPolicyParams,
  ) => void;
}

const EditSandboxingModalContainerInner = ({
  policy,
  push,
  params,
  route,
  location,
  fetchPolicy,
  fetchUserAttributes,
  policyRequestState,
  updatePolicy,
  updateTableSandboxingPermission,
}: EditSandboxingModalContainerProps) => {
  useEffect(() => {
    fetchPolicy(params);
    fetchUserAttributes();
  }, [fetchPolicy, params, fetchUserAttributes]);

  const { data: attributes } = useListUserAttributesQuery();
  const isLoading = policyRequestState?.loading || !attributes;

  if (!policyRequestState?.loaded) {
    return null;
  }

  const close = () => {
    return push(getParentPath(route, location));
  };

  const handleSave = async (policy: GroupTableAccessPolicy) => {
    updatePolicy(policy);
    updateTableSandboxingPermission(params);
    close();
  };

  return (
    <LoadingAndErrorWrapper
      loading={isLoading}
      error={policyRequestState?.error}
    >
      <EditSandboxingModal
        policy={policy}
        attributes={attributes || []}
        params={params}
        onCancel={close}
        onSave={handleSave}
      />
    </LoadingAndErrorWrapper>
  );
};

const mapStateToProps = (
  state: SandboxesState,
  props: EditSandboxingModalContainerProps,
) => ({
  policy: getGroupTableAccessPolicy(state, props),
  policyRequestState: getPolicyRequestState(state, props),
  attributes: getUserAttributes(state),
});

const mapDispatchToProps = {
  push,
  fetchPolicy,
  updatePolicy,
  fetchUserAttributes,
  updateTableSandboxingPermission,
};
export const EditSandboxingModalContainer = _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(EditSandboxingModalContainerInner);
