import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Button, Icon } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { trackAppNewButtonClicked } from "./analytics";

export interface NewItemButtonProps {
  collectionId?: CollectionId;
}

/** Prototype: notebooks are the only thing to create from the app bar. */
const NewItemButton = (_props: NewItemButtonProps) => (
  <Button
    variant="filled"
    component={ForwardRefLink}
    to="/document/new"
    leftSection={<Icon name="add" size={16} />}
    onClick={() => trackAppNewButtonClicked()}
  >
    {t`Notebook`}
  </Button>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewItemButton;
