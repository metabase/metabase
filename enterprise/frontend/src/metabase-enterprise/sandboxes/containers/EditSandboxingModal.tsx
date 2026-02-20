import type { Location } from "history";
import { useEffect } from "react";

import { useListUserAttributesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getParentPath } from "metabase/hoc/ModalRoute";
import { connect } from "metabase/lib/redux";
import { useRouter } from "metabase/router";
import { useNavigation } from "metabase/routing/compat";
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
import EditSandboxingModal from "../components/EditSandboxingModal";
import type { GroupTableAccessPolicyParams, SandboxesState } from "../types";

interface EditSandboxingModalContainerProps {
  policy: GroupTableAccessPolicy;
  attributes: UserAttributeKey[] | null;
  params: GroupTableAccessPolicyParams;
  location: Location;
  route: any;
  policyRequestState: any;
  fetchPolicy: (params: GroupTableAccessPolicyParams) => void;
  fetchUserAttributes: () => void;
  updatePolicy: (policy: GroupTableAccessPolicy) => void;
  updateTableSandboxingPermission: (
    params: GroupTableAccessPolicyParams,
  ) => void;
}

type EditSandboxingModalInnerProps = EditSandboxingModalContainerProps & {
  route: any;
  location: Location;
};

const EditSandboxingModalContainer = ({
  policy,
  params,
  location,
  route,
  fetchPolicy,
  fetchUserAttributes,
  policyRequestState,
  updatePolicy,
  updateTableSandboxingPermission,
}: EditSandboxingModalInnerProps) => {
  const { push } = useNavigation();

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
  fetchPolicy,
  updatePolicy,
  fetchUserAttributes,
  updateTableSandboxingPermission,
};

const ConnectedEditSandboxingModalContainer = connect(
  mapStateToProps,
  mapDispatchToProps,
)(EditSandboxingModalContainer);

const EditSandboxingModalContainerWithRouter = (props: any) => {
  const { routes, location } = useRouter();
  const route = routes[routes.length - 1];

  return (
    <ConnectedEditSandboxingModalContainer
      {...props}
      route={route}
      location={location}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditSandboxingModalContainerWithRouter;
