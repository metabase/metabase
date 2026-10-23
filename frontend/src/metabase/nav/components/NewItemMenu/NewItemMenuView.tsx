import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { getUserCanWriteToCollections } from "metabase/current-user";
import { NewMenuItemAIExploration } from "metabase/metabot/components/NewMenuItemAIExploration";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { setOpenModal } from "metabase/redux/ui";
import { getSetting } from "metabase/settings";
import { Box, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  CollectionId,
  IconName,
  ProductAnalyticsKind,
} from "metabase-types/api";

import { trackNewMenuItemClicked } from "./analytics";

type AnalysisKindItem = {
  kind: ProductAnalyticsKind;
  icon: IconName;
  getName: () => string;
};

const ANALYSIS_KIND_ITEMS: AnalysisKindItem[] = [
  { kind: "funnel", icon: "funnel", getName: () => t`Funnel` },
  { kind: "paths", icon: "sankey", getName: () => t`Paths` },
  { kind: "habit", icon: "history", getName: () => t`Habit` },
  { kind: "lifecycle", icon: "refresh", getName: () => t`Lifecycle` },
  { kind: "cohorts", icon: "grid", getName: () => t`Cohort retention` },
];
export interface NewItemMenuProps {
  className?: string;
  collectionId?: CollectionId;
  trigger?: ReactNode;
  triggerIcon?: string;
  triggerTooltip?: string;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
  hasDatabaseWithJsonEngine: boolean;
  onCloseNavbar: () => void;
}

export const NewItemMenuView = ({
  collectionId,
  trigger,
  hasDataAccess,
  hasNativeWrite,
  hasDatabaseWithJsonEngine,
}: NewItemMenuProps) => {
  const dispatch = useDispatch();
  // Picking "Product analysis" swaps the menu for the kinds of analysis.
  const [isPickingAnalysisKind, setIsPickingAnalysisKind] = useState(false);
  // The swap unmounts the focused "Product analysis" item, which leaves focus on
  // the page, where a modifier key like Cmd (to open an item in a new tab)
  // closes the menu. Focusing the menu keeps it open.
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isPickingAnalysisKind) {
      dropdownRef.current?.focus();
    }
  }, [isPickingAnalysisKind]);

  const lastUsedDatabaseId = useSelector((state) =>
    getSetting(state, "last-used-native-database-id"),
  );
  const areAiFeaturesEnabled = useSelector(
    (state) => getSetting(state, "ai-features-enabled?") !== false,
  );

  const canWriteToCollections = useSelector(getUserCanWriteToCollections);

  const { hasNlqAccess } = useUserMetabotPermissions();

  const menuItems = useMemo(() => {
    const items = [];

    if (hasDataAccess && areAiFeaturesEnabled) {
      items.push(
        <NewMenuItemAIExploration
          key="nlq"
          collectionId={collectionId}
          hasNlqAccess={hasNlqAccess}
        />,
      );
    }

    if (hasDataAccess) {
      items.push(
        <Menu.Item
          key="event-analysis"
          closeMenuOnClick={false}
          onClick={() => setIsPickingAnalysisKind(true)}
          leftSection={<Icon name="funnel" />}
        >
          {t`Product analysis`}
        </Menu.Item>,
      );
    }

    if (hasDataAccess) {
      items.push(
        <Menu.Item
          key="question"
          component={ForwardRefLink}
          to={Urls.newQuestion({
            mode: "notebook",
            creationType: "custom_question",
            collectionId,
            cardType: "question",
          })}
          leftSection={<Icon name="insight" />}
        >
          {t`Question`}
        </Menu.Item>,
      );
    }

    if (hasNativeWrite) {
      items.push(
        <Menu.Item
          key="native"
          component={ForwardRefLink}
          to={Urls.newQuestion({
            DEPRECATED_RAW_MBQL_type: "native",
            creationType: "native_question",
            collectionId,
            cardType: "question",
            DEPRECATED_RAW_MBQL_databaseId: lastUsedDatabaseId || undefined,
          })}
          leftSection={<Icon name="sql" />}
        >
          {hasDatabaseWithJsonEngine ? t`Native query` : t`SQL query`}
        </Menu.Item>,
      );
    }

    if (canWriteToCollections) {
      items.push(
        <Menu.Item
          key="dashboard"
          onClick={() => {
            trackNewMenuItemClicked("dashboard");
            dispatch(setOpenModal("dashboard"));
          }}
          leftSection={<Icon name="dashboard" />}
        >
          {t`Dashboard`}
        </Menu.Item>,
      );
    }

    items.push(
      <Menu.Item
        key="document"
        component={ForwardRefLink}
        to="/document/new"
        leftSection={<Icon name="document" />}
      >
        {t`Document`}
      </Menu.Item>,
    );

    return items;
  }, [
    hasDataAccess,
    areAiFeaturesEnabled,
    hasNativeWrite,
    collectionId,
    lastUsedDatabaseId,
    hasDatabaseWithJsonEngine,
    dispatch,
    canWriteToCollections,
    hasNlqAccess,
  ]);

  if (menuItems.length === 0) {
    return null;
  }

  return (
    <Menu position="bottom-end" onOpen={() => setIsPickingAnalysisKind(false)}>
      <Menu.Target>
        <Box>{trigger}</Box>
      </Menu.Target>
      <Menu.Dropdown ref={dropdownRef}>
        {isPickingAnalysisKind
          ? ANALYSIS_KIND_ITEMS.map(({ kind, icon, getName }) => (
              <Menu.Item
                key={kind}
                component={ForwardRefLink}
                to={Urls.newEventAnalysis(kind)}
                leftSection={<Icon name={icon} />}
              >
                {getName()}
              </Menu.Item>
            ))
          : menuItems}
      </Menu.Dropdown>
    </Menu>
  );
};
