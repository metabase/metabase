import type { Location } from "history";
import type * as React from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import Radio from "metabase/core/components/Radio";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Box } from "metabase/ui";
import type { State } from "metabase-types/store";

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
  const tabs: ToolTab[] = [
    {
      name: t`Questions`,
      value: "errors",
    },
  ];

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
        <Box mt="sm" px="lg" className={CS.borderBottom}>
          <Radio
            colorScheme="accent7"
            value={currentTab}
            options={tabs}
            onOptionClick={navigateToTab}
            variant="underlined"
          />
        </Box>
      )}
      <Box mt="xl" px="lg">
        {children}
      </Box>
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
