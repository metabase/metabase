import { connect } from "react-redux";

import { PublicError } from "metabase/public/components/PublicError";
import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import { getErrorPage } from "metabase/selectors/app";
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
