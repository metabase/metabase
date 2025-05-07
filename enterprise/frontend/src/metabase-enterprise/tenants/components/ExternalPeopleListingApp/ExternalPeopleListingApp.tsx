import type { WithRouterProps } from "react-router";

import { PeopleListingApp } from "metabase/admin/people/containers/PeopleListingApp";

export const ExternalPeopleListingApp = (
  props: React.PropsWithChildren<WithRouterProps>,
) => <PeopleListingApp {...props} external />;
