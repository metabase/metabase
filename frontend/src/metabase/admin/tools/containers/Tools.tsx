import type { Location } from "history";
import type * as React from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";

import Radio from "metabase/core/components/Radio";
import { PLUGIN_ADMIN_TOOLS } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

import { TabsContainer, ContentContainer } from "./Tools.styled";

type ToolsOwnProps = {
  location: Location;
  children: React.ReactNode;
};

type ToolsStateProps = {
  isModelPersistenceEnabled?: boolean;
};

type ToolsDispatchProps = {
  navigateToTab: (tab: string) => void;
};

type Props = ToolsOwnProps & ToolsStateProps & ToolsDispatchProps;

type ToolTab = {
  name: string;
  value: string;
};

function mapStateToProps(state: State) {
  return {
    isModelPersistenceEnabled: getSetting(state, "persisted-models-enabled"),
  };
}

const mapDispatchToProps = {
  navigateToTab: (tab: string) => push(`/admin/tools/${tab}`),
};

function getCurrentTab(location: Location, tabs: ToolTab[]) {
  const parts = location.pathname.split("/");
  const tab = tabs.find(tab => parts.some(part => part === tab.value));
  return tab?.value;
}

function Tools({
  location,
  isModelPersistenceEnabled,
  children,
  navigateToTab,
}: Props) {
  const tabs: ToolTab[] = [...PLUGIN_ADMIN_TOOLS.EXTRA_ROUTES_INFO];

  if (isModelPersistenceEnabled) {
    tabs.push({
      name: t`Model Caching Log`,
      value: "model-caching",
    });
  }

  const currentTab = getCurrentTab(location, tabs);

  return (
    <>
      {tabs.length > 1 && (
        <TabsContainer>
          <Radio
            colorScheme="accent7"
            value={currentTab}
            options={tabs}
            onOptionClick={navigateToTab}
            variant="underlined"
          />
        </TabsContainer>
      )}
      <ContentContainer>{children}</ContentContainer>
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<
  ToolsStateProps,
  ToolsDispatchProps,
  ToolsOwnProps,
  State
>(
  mapStateToProps,
  mapDispatchToProps,
)(Tools);
