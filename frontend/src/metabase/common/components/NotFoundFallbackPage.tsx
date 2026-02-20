import type { LocationDescriptor } from "history";
import { useMount } from "react-use";

import { NotFound } from "metabase/common/components/ErrorPages";
import { connect } from "metabase/lib/redux";
import { refreshCurrentUser } from "metabase/redux/user";
import { useNavigation } from "metabase/routing/compat";

type DispatchProps = {
  refreshCurrentUser: () => any;
};

type Props = DispatchProps & {
  onChangeLocation?: (location: LocationDescriptor) => void;
};

const mapDispatchToProps = {
  refreshCurrentUser,
};

const NotFoundFallbackPageInner = ({ refreshCurrentUser }: Props) => {
  const { replace } = useNavigation();

  useMount(() => {
    async function refresh() {
      const result = await refreshCurrentUser();
      const isSignedIn = !result.error;
      if (!isSignedIn) {
        replace("/auth/login");
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
