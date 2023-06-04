import { useEffect } from "react";
import _ from "underscore";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import {
  getGroupTableAccessPolicy,
  getPolicyRequestState,
  getAttributes,
} from "metabase-enterprise/sandboxes/selectors";
import { getParentPath } from "metabase/hoc/ModalRoute";
import { GroupTableAccessPolicy, UserAttribute } from "metabase-types/api";
import EditSandboxingModal from "../components/EditSandboxingModal";

import {
  updatePolicy,
  fetchPolicy,
  fetchAttributes,
  updateTableSandboxingPermission,
} from "../actions";
import { GroupTableAccessPolicyParams, SandboxesState } from "../types";

interface EditSandboxingModalContainerProps {
  policy: GroupTableAccessPolicy;
  attributes: UserAttribute[];
  push: (path: string) => void;
  params: GroupTableAccessPolicyParams;
  route: any;
  policyRequestState: any;
  fetchPolicy: (params: GroupTableAccessPolicyParams) => void;
  fetchAttributes: () => void;
  updatePolicy: (policy: GroupTableAccessPolicy) => void;
  updateTableSandboxingPermission: (
    params: GroupTableAccessPolicyParams,
  ) => void;
}

const EditSandboxingModalContainer = ({
  policy,
  attributes,
  push,
  params,
  route,
  fetchPolicy,
  fetchAttributes,
  policyRequestState,
  updatePolicy,
  updateTableSandboxingPermission,
}: EditSandboxingModalContainerProps) => {
  useEffect(() => {
    fetchPolicy(params);
    fetchAttributes();
  }, [fetchPolicy, params, fetchAttributes]);

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
        attributes={attributes}
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
  attributes: getAttributes(state),
});

const mapDispatchToProps = {
  push,
  fetchPolicy,
  updatePolicy,
  fetchAttributes,
  updateTableSandboxingPermission,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(EditSandboxingModalContainer);
