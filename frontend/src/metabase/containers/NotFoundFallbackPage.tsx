import React from "react";
import { connect } from "react-redux";
import { replace } from "react-router-redux";
import { LocationDescriptor } from "history";

import { refreshCurrentUser } from "metabase/redux/user";
import { useOnMount } from "metabase/hooks/use-on-mount";

import { NotFound } from "./ErrorPages";

type DispatchProps = {
  refreshCurrentUser: () => any;
  onChangeLocation: (location: LocationDescriptor) => void;
};

type Props = DispatchProps;

const mapDispatchToProps = {
  refreshCurrentUser,
  onChangeLocation: replace,
};

const NotFoundFallbackPage = ({
  refreshCurrentUser,
  onChangeLocation,
}: Props) => {
  useOnMount(() => {
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

export default connect(null, mapDispatchToProps)(NotFoundFallbackPage);
