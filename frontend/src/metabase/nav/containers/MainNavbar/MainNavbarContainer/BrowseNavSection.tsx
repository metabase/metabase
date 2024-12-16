import { c, t } from "ttag";

import { useUserSetting } from "metabase/common/hooks";
import CollapseSection from "metabase/components/CollapseSection";
import CS from "metabase/css/core/index.css";

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
  const BROWSE_MODELS_URL = "/browse/models";
  const BROWSE_DATA_URL = "/browse/databases";
  const BROWSE_METRICS_URL = "/browse/metrics";

  const [expandBrowse = true, setExpandBrowse] = useUserSetting(
    "expand-browse-in-nav",
  );

  return (
    <CollapseSection
      header={
        <SidebarHeading>{c("A verb, shown in the sidebar")
          .t`Browse`}</SidebarHeading>
      }
      initialState={expandBrowse ? "expanded" : "collapsed"}
      iconPosition="right"
      iconSize={8}
      headerClass={CS.mb1}
      onToggle={setExpandBrowse}
    >
      <PaddedSidebarLink
        icon="model"
        url={BROWSE_MODELS_URL}
        isSelected={nonEntityItem?.url?.startsWith(BROWSE_MODELS_URL)}
        onClick={onItemSelect}
        aria-label={t`Browse models`}
      >
        {t`Models`}
      </PaddedSidebarLink>

      {hasDataAccess && (
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
        icon="metric"
        url={BROWSE_METRICS_URL}
        isSelected={nonEntityItem?.url?.startsWith(BROWSE_METRICS_URL)}
        onClick={onItemSelect}
        aria-label={t`Browse metrics`}
      >
        {t`Metrics`}
      </PaddedSidebarLink>
    </CollapseSection>
  );
};
