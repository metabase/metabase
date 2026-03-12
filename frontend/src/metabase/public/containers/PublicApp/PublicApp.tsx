import { useLayoutEffect } from "react";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { isWithinIframe } from "metabase/lib/dom";
import { connect, useSelector } from "metabase/lib/redux";
import { PublicError } from "metabase/public/components/PublicError";
import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import { getErrorPage } from "metabase/selectors/app";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { PublicStatusListing } from "metabase/status/components/PublicStatusListing";
import type { AppErrorDescriptor, State } from "metabase-types/store";

interface OwnProps {
  children: JSX.Element;
}

interface StateProps {
  errorPage?: AppErrorDescriptor | null;
}

type Props = OwnProps & StateProps;

function mapStateToProps(state: State) {
  return {
    errorPage: getErrorPage(state),
  };
}

function PublicApp({ errorPage, children }: Props) {
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
      {children}
      <PublicStatusListing />
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<StateProps, unknown, OwnProps, State>(mapStateToProps)(
  PublicApp,
);
