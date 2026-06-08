import { useLayoutEffect } from "react";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { PublicError } from "metabase/public/components/PublicError";
import { PublicLinkUnlockForm } from "metabase/public/components/PublicLinkUnlockForm";
import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import { connect, useSelector } from "metabase/redux";
import type { AppErrorDescriptor, State } from "metabase/redux/store";
import { getErrorPage } from "metabase/selectors/app";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { PublicStatusListing } from "metabase/status/components/PublicStatusListing";
import { isWithinIframe } from "metabase/utils/iframe";

interface OwnProps {
  children: JSX.Element;
  location: { pathname: string };
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

function parsePublicEntity(pathname: string): {
  uuid: string;
  entityType: "card" | "dashboard";
} | null {
  const cardMatch = pathname.match(/\/public\/(?:question|card)\/([^/]+)/);
  if (cardMatch) {
    return { uuid: cardMatch[1], entityType: "card" };
  }
  const dashMatch = pathname.match(/\/public\/dashboard\/([^/]+)/);
  if (dashMatch) {
    return { uuid: dashMatch[1], entityType: "dashboard" };
  }
  return null;
}

function isPasswordRequired(
  errorPage: AppErrorDescriptor | null | undefined,
): boolean {
  return (
    errorPage?.status === 403 &&
    errorPage?.data?.error_code === "public-link-password-required"
  );
}

function PublicApp({ errorPage, children, location }: Props) {
  const applicationName = useSelector(getApplicationName);

  usePageTitle(applicationName, { titleIndex: 0 });

  useLayoutEffect(() => {
    if (isWithinIframe()) {
      document.body.style.backgroundColor = "transparent";
    }
  }, []);

  if (errorPage) {
    if (isPasswordRequired(errorPage)) {
      const entity = parsePublicEntity(location.pathname);
      if (entity) {
        return (
          <PublicLinkUnlockForm
            uuid={entity.uuid}
            entityType={entity.entityType}
          />
        );
      }
    }
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
