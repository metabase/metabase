import React from "react";
import { t } from "ttag";
import { Location } from "history";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import Radio from "metabase/core/components/Radio";
import { PLUGIN_ADMIN_TOOLS } from "metabase/plugins";

import { TabsContainer, ContentContainer } from "./Tools.styled";

type ToolsOwnProps = {
  location: Location;
  children: React.ReactNode;
};

type ToolsDispatchProps = {
  navigateToTab: (tab: string) => void;
};

type Props = ToolsOwnProps & ToolsDispatchProps;

const mapDispatchToProps = {
  navigateToTab: (tab: string) => push(`/admin/tools/${tab}`),
};

const TABS = [
  ...PLUGIN_ADMIN_TOOLS.EXTRA_ROUTES_INFO,
  {
    name: t`Model Caching Log`,
    value: "model-caching",
  },
];

function getCurrentTab(location: Location) {
  const parts = location.pathname.split("/");
  const tab = TABS.find(tab => parts.some(part => part === tab.value));
  return tab?.value;
}

function Tools({ location, children, navigateToTab }: Props) {
  const currentTab = getCurrentTab(location);

  return (
    <>
      {TABS.length > 1 && (
        <TabsContainer>
          <Radio
            colorScheme="accent7"
            value={currentTab}
            options={TABS}
            onOptionClick={navigateToTab}
            variant="underlined"
          />
        </TabsContainer>
      )}
      <ContentContainer>{children}</ContentContainer>
    </>
  );
}

export default connect<unknown, ToolsDispatchProps, ToolsOwnProps>(
  null,
  mapDispatchToProps,
)(Tools);
