import React from "react";
import HomeLayout from "../../containers/HomeLayout";
import XraySection from "../../containers/XraySection";

const HomePage = (): JSX.Element => {
  return (
    <HomeLayout>
      <XraySection />
    </HomeLayout>
  );
};

export default HomePage;
