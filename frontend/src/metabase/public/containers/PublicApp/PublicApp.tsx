import { useLayoutEffect } from "react";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { PublicError } from "metabase/public/components/PublicError";
import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import { connect, useSelector } from "metabase/redux";
import type { AppErrorDescriptor, State } from "metabase/redux/store";
import { Outlet } from "metabase/router";
import { getErrorPage } from "metabase/selectors/app";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { PublicStatusListing } from "metabase/status/components/PublicStatusListing";
import { isWithinIframe } from "metabase/utils/iframe";

interface StateProps {
  errorPage?: AppErrorDescriptor | null;
}

type Props = StateProps;

function mapStateToProps(state: State) {
  return {
    errorPage: getErrorPage(state),
  };
}

function PublicApp({ errorPage }: Props) {
  const applicationName = useSelector(getApplicationName);

  usePageTitle(applicationName, { titleIndex: 0 });

  useLayoutEffect(() => {
    if (isWithinIframe()) {
      document.body.style.backgroundColor = "transparent";
    }
  }, []);

  if (errorPage) {
    return errorPage.status === 404 ? <PublicNotFound /> : <PublicError />;
  }

  return (
    <>
      <Outlet />
      <PublicStatusListing />
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<StateProps, unknown, unknown, State>(mapStateToProps)(
  PublicApp,
);
