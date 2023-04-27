import React, { useEffect } from "react";
import { isSmallScreen } from "metabase/lib/dom";
import Dashboard from "metabase/dashboard/containers/Dashboard";
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
  useEffect(() => {
    if (!isSmallScreen()) {
      onOpenNavbar();
    }
  }, [onOpenNavbar]);

  if (homepageDashboard) {
    return <Dashboard dashboardId={homepageDashboard} />;
  }

  return (
    <HomeLayout hasMetabot={hasMetabot}>
      <HomeContent />
    </HomeLayout>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HomePage;
