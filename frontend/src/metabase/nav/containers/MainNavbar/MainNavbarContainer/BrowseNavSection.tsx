import { useDisclosure } from "@mantine/hooks";
import { c, t } from "ttag";

import { useUserSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getEntityTypes } from "metabase/selectors/embedding-data-picker";
import {
  ActionIcon,
  Collapse,
  Flex,
  Group,
  Icon,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";

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
  const BROWSE_MODELS_URL = "/browse/models";
  const BROWSE_DATA_URL = "/browse/databases";
  const BROWSE_METRICS_URL = "/browse/metrics";

  const [expandBrowse = true, setExpandBrowse] = useUserSetting(
    "expand-browse-in-nav",
  );

  const { canPerformMeaningfulActions } = useAddDataPermissions();
  const [opened, { toggle }] = useDisclosure(expandBrowse);
  const entityTypes = useSelector(getEntityTypes);
  const isEmbeddingIframe = useSelector(getIsEmbeddingIframe);

  const handleToggle = () => {
    toggle();
    setExpandBrowse(!opened);
  };

  const showAddDataButton = canPerformMeaningfulActions && !isEmbeddingIframe;

  return (
    <div aria-selected={opened} role="tab">
      <Flex align="center" justify="space-between" mb="sm">
        <Group
          align="center"
          gap="sm"
          onClick={handleToggle}
          component={UnstyledButton}
          c="text-medium"
          className={CS.cursorPointer}
        >
          <SidebarHeading>
            {c("A noun, shown in the sidebar as a navigation link").t`Data`}
          </SidebarHeading>
          <Icon name={opened ? "chevrondown" : "chevronright"} size={8} />
        </Group>
        {showAddDataButton && (
          <Tooltip label={t`Add data`}>
            <ActionIcon
              aria-label={t`Add data`}
              color="var(--mb-color-text-medium)"
              onClick={() => {
                trackAddDataModalOpened("left-nav");
                onAddDataModalOpen();
              }}
            >
              <Icon name="add" />
            </ActionIcon>
          </Tooltip>
        )}
      </Flex>

      <Collapse
        in={opened}
        transitionDuration={0}
        role="tabpanel"
        aria-expanded={opened}
      >
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

        {(!isEmbeddingIframe || entityTypes.includes("model")) && (
          <PaddedSidebarLink
            icon="model"
            url={BROWSE_MODELS_URL}
            isSelected={nonEntityItem?.url?.startsWith(BROWSE_MODELS_URL)}
            onClick={onItemSelect}
            aria-label={t`Browse models`}
          >
            {t`Models`}
          </PaddedSidebarLink>
        )}

        {!isEmbeddingIframe && (
          <PaddedSidebarLink
            icon="metric"
            url={BROWSE_METRICS_URL}
            isSelected={nonEntityItem?.url?.startsWith(BROWSE_METRICS_URL)}
            onClick={onItemSelect}
            aria-label={t`Browse metrics`}
          >
            {t`Metrics`}
          </PaddedSidebarLink>
        )}
      </Collapse>
    </div>
  );
};
