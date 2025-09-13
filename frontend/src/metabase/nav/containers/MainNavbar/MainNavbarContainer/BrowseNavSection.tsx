import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getEntityTypes } from "metabase/selectors/embedding-data-picker";
import { Button, Flex, Icon } from "metabase/ui";

import { PaddedSidebarLink, SidebarHeading } from "../MainNavbar.styled";
import { trackAddDataModalOpened } from "../analytics";
import type { SelectedItem } from "../types";

import { useAddDataPermissions } from "./AddDataModal/use-add-data-permission";

export const BrowseNavSection = ({
  nonEntityItem,
  onItemSelect,
  onAddDataModalOpen,
  hasDataAccess,
}: {
  nonEntityItem: SelectedItem;
  onItemSelect: () => void;
  onAddDataModalOpen: () => void;
  hasDataAccess: boolean;
}) => {
  const BROWSE_DATA_URL = "/browse/databases";

  const { canPerformMeaningfulActions } = useAddDataPermissions();
  const entityTypes = useSelector(getEntityTypes);
  const isEmbeddingIframe = useSelector(getIsEmbeddingIframe);

  const showAddDataButton = canPerformMeaningfulActions && !isEmbeddingIframe;

  return (
    <div>
      <Flex align="center" justify="space-between" mb="sm">
        <SidebarHeading>{t`Data`}</SidebarHeading>
        {showAddDataButton && (
          <Button
            aria-label="Add data"
            variant="subtle"
            leftSection={<Icon name="add_data" />}
            h="auto"
            p={0}
            onClick={() => {
              trackAddDataModalOpened("left-nav");
              onAddDataModalOpen();
            }}
          >
            {t`Add`}
          </Button>
        )}
      </Flex>

      {hasDataAccess &&
        (!isEmbeddingIframe || entityTypes.includes("table")) && (
          <PaddedSidebarLink
            icon="database"
            url={BROWSE_DATA_URL}
            isSelected={nonEntityItem?.url?.startsWith(BROWSE_DATA_URL)}
            onClick={onItemSelect}
            aria-label={t`Browse databases`}
          >
            {t`Databases`}
          </PaddedSidebarLink>
        )}
    </div>
  );
};
