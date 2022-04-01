import React from "react";
import HomeLayout from "../../containers/HomeLayout";
import HomeContent from "../../containers/HomeContent";

const HomePage = (): JSX.Element => {
  return (
    <HomeLayout>
      <HomeContent />
    </HomeLayout>
  );
};

export default HomePage;
