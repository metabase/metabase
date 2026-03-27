import type { LocationDescriptor } from "history";
import { replace } from "react-router-redux";
import { useMount } from "react-use";

import { NotFound } from "metabase/common/components/ErrorPages";
import { connect } from "metabase/lib/redux";
import { refreshCurrentUser } from "metabase/redux/user";

type DispatchProps = {
  refreshCurrentUser: () => any;
  onChangeLocation: (location: LocationDescriptor) => void;
};

type Props = DispatchProps;

const mapDispatchToProps = {
  refreshCurrentUser,
  onChangeLocation: replace,
};

const NotFoundFallbackPageInner = ({
  refreshCurrentUser,
  onChangeLocation,
}: Props) => {
  useMount(() => {
    async function refresh() {
      const result = await refreshCurrentUser();
      const isSignedIn = !result.error;
      if (!isSignedIn) {
        onChangeLocation("/auth/login");
      }
    }
    refresh();
  });

  return <NotFound />;
};

export const NotFoundFallbackPage = connect(
  null,
  mapDispatchToProps,
)(NotFoundFallbackPageInner);
