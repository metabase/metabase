import { c, t } from "ttag";

import { useUserSetting } from "metabase/common/hooks";
import { useHasModels } from "metabase/common/hooks/use-has-models";
import CollapseSection from "metabase/components/CollapseSection";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { Flex, Loader } from "metabase/ui";

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

  const {
    hasModels,
    isLoading: areModelsLoading,
    error: modelsError,
  } = useHasModels();
  const noModelsExist = hasModels === false;

  const [expandBrowse = true, setExpandBrowse] = useUserSetting(
    "expand-browse-in-nav",
  );

  if (noModelsExist && !hasDataAccess) {
    return null;
  }

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
      <DelayedLoadingAndErrorWrapper
        loading={areModelsLoading}
        error={modelsError}
        loader={
          <Flex py="sm" px="md" h="32.67px" align="center">
            <Loader size={14} style={{ paddingInlineStart: "2px" }} />
          </Flex>
        }
        delay={0}
      >
        {!noModelsExist && (
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
      </DelayedLoadingAndErrorWrapper>
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
    </CollapseSection>
  );
};
