import { useDisclosure } from "@mantine/hooks";
import { c, t } from "ttag";

import { useUserSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getEntityTypes } from "metabase/selectors/embedding-data-picker";
import { Collapse, Group, Icon, UnstyledButton } from "metabase/ui";

import { PaddedSidebarLink, SidebarHeading } from "../MainNavbar.styled";
import type { SelectedItem } from "../types";

export const BrowseNavSection = ({
  nonEntityItem,
  onItemSelect,
  hasDataAccess,
}: {
  nonEntityItem: SelectedItem;
  onItemSelect: () => void;
  hasDataAccess: boolean;
}) => {
  const BROWSE_DATA_URL = "/browse/databases";
  const CATALOG_URL = "/catalog";

  const [expandBrowse = true, setExpandBrowse] = useUserSetting(
    "expand-browse-in-nav",
  );

  const [opened, { toggle }] = useDisclosure(expandBrowse);

  const entityTypes = useSelector(getEntityTypes);
  const isEmbeddingIframe = useSelector(getIsEmbeddingIframe);

  const handleToggle = () => {
    toggle();
    setExpandBrowse(!opened);
  };

  return (
    <div aria-selected={opened} role="tab">
      <Group
        align="center"
        gap="sm"
        onClick={handleToggle}
        component={UnstyledButton}
        c="text-medium"
        mb="sm"
        className={CS.cursorPointer}
      >
        <SidebarHeading>{c("A verb, shown in the sidebar")
          .t`Browse`}</SidebarHeading>
        <Icon name={opened ? "chevrondown" : "chevronright"} size={8} />
      </Group>

      <Collapse in={opened} transitionDuration={0} role="tabpanel">
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

        <PaddedSidebarLink
          icon="list"
          url={CATALOG_URL}
          isSelected={nonEntityItem?.url === CATALOG_URL}
          onClick={onItemSelect}
          aria-label={t`Browse catalog`}
        >
          {t`Catalog`}
        </PaddedSidebarLink>
      </Collapse>
    </div>
  );
};
