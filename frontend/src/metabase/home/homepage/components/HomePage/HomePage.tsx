import React, { useEffect } from "react";
import { isSmallScreen } from "metabase/lib/dom";
import HomeLayout from "../HomeLayout";
import HomeContent from "../../containers/HomeContent";

export interface HomePageProps {
  hasMetabot: boolean;
  onOpenNavbar: () => void;
}

const HomePage = ({ hasMetabot, onOpenNavbar }: HomePageProps): JSX.Element => {
  useEffect(() => {
    if (!isSmallScreen()) {
      onOpenNavbar();
    }
  }, [onOpenNavbar]);

  return (
    <HomeLayout hasMetabot={hasMetabot}>
      <HomeContent />
    </HomeLayout>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HomePage;
