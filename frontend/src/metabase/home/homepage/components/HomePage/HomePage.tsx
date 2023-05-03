import React, { useEffect } from "react";
import { replace } from "react-router-redux";
import { isSmallScreen } from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";

import HomeLayout from "../HomeLayout";
import HomeContent from "../../containers/HomeContent";

export interface HomePageProps {
  hasMetabot: boolean;
  homepageDashboard?: number;
  onOpenNavbar: () => void;
  isAdmin: boolean;
}

const HomePage = ({
  hasMetabot,
  onOpenNavbar,
  homepageDashboard,
  isAdmin,
}: HomePageProps): JSX.Element => {
  const dispatch = useDispatch();
  useEffect(() => {
    if (!isSmallScreen()) {
      onOpenNavbar();
    }
  }, [onOpenNavbar]);

  if (homepageDashboard) {
    dispatch(replace(`/dashboard/${homepageDashboard}`));
  }

  return (
    <HomeLayout hasMetabot={hasMetabot} isAdmin={isAdmin}>
      <HomeContent />
    </HomeLayout>
  );
};

export default HomePage;
