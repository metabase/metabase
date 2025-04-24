import type { Location } from "history";
import { withRouter } from "react-router";

import { DataModelApp } from "metabase/admin/datamodel/containers/DataModelApp";

interface Props {
  location: Location;
}

const DataModelBase = ({ location }: Props) => (
  <DataModelApp location={location}>Well begun is half done</DataModelApp>
);

export const DataModel = withRouter(DataModelBase);
