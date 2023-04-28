import React, { useEffect, useState } from "react";
import { isSmallScreen } from "metabase/lib/dom";
import Dashboard from "metabase/dashboard/containers/Dashboard";
import Dashboards from "metabase/entities/dashboards";
import HomeLayout from "../HomeLayout";
import HomeContent from "../../containers/HomeContent";

export interface HomePageProps {
  hasMetabot: boolean;
  homepageDashboard: number;
  onOpenNavbar: () => void;
}

const HomePage = ({
  hasMetabot,
  onOpenNavbar,
  homepageDashboard,
}: HomePageProps): JSX.Element => {
  const [showDashboard, setShowDashboard] = useState(true);
  useEffect(() => {
    if (!isSmallScreen()) {
      onOpenNavbar();
    }
  }, [onOpenNavbar]);

  if (homepageDashboard && showDashboard) {
    return (
      <Dashboards.Loader
        id={homepageDashboard}
        loadingAndErrorWrapper={false}
        dispatchApiErrorEvent={false}
      >
        {({ loading, error, dashboard }) => {
          if (!loading && error) {
            setShowDashboard(false);
          } else if (dashboard) {
            return <Dashboard dashboardId={homepageDashboard} />;
          }

          return null;
        }}
      </Dashboards.Loader>
    );
  }

  return (
    <HomeLayout hasMetabot={hasMetabot}>
      <HomeContent />
    </HomeLayout>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HomePage;
