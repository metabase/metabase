import React from "react";
import { connect } from "react-redux";
import { replace } from "react-router-redux";
import { LocationDescriptor } from "history";

import { setErrorPage } from "metabase/redux/app";
import { refreshCurrentUser } from "metabase/redux/user";
import { useOnMount } from "metabase/hooks/use-on-mount";

import { AppErrorDescriptor } from "metabase-types/store";

import { NotFound } from "./ErrorPages";

type DispatchProps = {
  setErrorPage: (err: AppErrorDescriptor) => void;
  refreshCurrentUser: () => any;
  onChangeLocation: (location: LocationDescriptor) => void;
};

type Props = DispatchProps;

const mapDispatchToProps = {
  setErrorPage,
  refreshCurrentUser,
  onChangeLocation: replace,
};

const NOT_FOUND_ERROR: AppErrorDescriptor = {
  status: 404,
  data: {
    error_code: "not-found",
  },
};

const NotFoundFallbackPage = ({
  setErrorPage,
  refreshCurrentUser,
  onChangeLocation,
}: Props) => {
  useOnMount(() => {
    async function refresh() {
      const result = await refreshCurrentUser();
      const isSignedIn = !result.error;
      if (isSignedIn) {
        setErrorPage(NOT_FOUND_ERROR);
      } else {
        onChangeLocation("/auth/login");
      }
    }
    refresh();
  });

  return <NotFound />;
};

export default connect(null, mapDispatchToProps)(NotFoundFallbackPage);
