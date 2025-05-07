import { Link } from "react-router";

import { Button, Icon } from "metabase/ui";
import * as Urls from "metabase-enterprise/urls";

export const EditUserStrategySettingsButton = () => (
  <Link to={Urls.editUserStrategy()}>
    <Button>
      <Icon name="gear" mb="-2px" />
    </Button>
  </Link>
);
