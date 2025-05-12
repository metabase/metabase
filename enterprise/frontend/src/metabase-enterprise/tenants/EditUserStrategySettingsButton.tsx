import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";
import { Button, Icon } from "metabase/ui";

export const EditUserStrategySettingsButton = () => (
  <Link to={Urls.editUserStrategy()}>
    <Button>
      <Icon name="gear" mb="-2px" />
    </Button>
  </Link>
);
