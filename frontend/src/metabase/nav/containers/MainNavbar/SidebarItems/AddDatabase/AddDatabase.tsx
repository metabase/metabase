import { Link } from "react-router";
import { c } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Box, Button, Icon } from "metabase/ui";

import { trackAddDatabaseSidebar } from "./analytics";

export const AddDatabase = () => {
  return (
    <Link to={Urls.newDatabase()} data-testid="add-database-link">
      <Box px="md">
        <Button
          color="brand"
          fullWidth={true}
          leftIcon={<Icon name="add" />}
          onClick={() => trackAddDatabaseSidebar()}
          radius="xl"
          variant="outline"
        >
          {c("Text for a button that lets you add a new database")
            .t`Add database`}
        </Button>
      </Box>
    </Link>
  );
};
