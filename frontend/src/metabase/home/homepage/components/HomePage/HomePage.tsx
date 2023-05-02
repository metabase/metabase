import React, { useEffect, useState } from "react";
import { isSmallScreen } from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";
import { replace } from "react-router-redux";
import Dashboards from "metabase/entities/dashboards";

import {Dashboard as DashboardType} from "metabase-types/api";
import HomeLayout from "../HomeLayout";
import HomeContent from "../../containers/HomeContent";


export interface HomePageProps {
  hasMetabot: boolean;
  homepageDashboard?: number;
  onOpenNavbar: () => void;
}

interface DashboardLoaderProps {
  loading: boolean;
  error: any;
  dashboard: DashboardType
}

const HomePage = ({
  hasMetabot,
  onOpenNavbar,
  homepageDashboard,
}: HomePageProps): JSX.Element => {
  const [showDashboard, setShowDashboard] = useState(true);
  const dispatch = useDispatch();
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
        {({ loading, error, dashboard }: DashboardLoaderProps) => {
          if (!loading && error) {
            setShowDashboard(false);
          } else if (dashboard) {
            dispatch(replace(`/dashboard/${homepageDashboard}`))
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
