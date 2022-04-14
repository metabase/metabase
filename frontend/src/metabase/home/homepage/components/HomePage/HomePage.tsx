import React, { useEffect } from "react";
import { isSmallScreen } from "metabase/lib/dom";
import HomeLayout from "../../containers/HomeLayout";
import HomeContent from "../../containers/HomeContent";

export interface HomePageProps {
  onOpenNavbar: () => void;
}

const HomePage = ({ onOpenNavbar }: HomePageProps): JSX.Element => {
  useEffect(() => {
    if (!isSmallScreen()) {
      onOpenNavbar();
    }
  }, [onOpenNavbar]);

  return (
    <HomeLayout>
      <HomeContent />
    </HomeLayout>
  );
};

export default HomePage;
