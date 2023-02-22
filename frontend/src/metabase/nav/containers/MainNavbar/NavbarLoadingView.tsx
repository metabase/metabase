import React from "react";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";

import { LoadingContainer, LoadingTitle } from "./MainNavbar.styled";

function NavbarLoadingView() {
  return (
    <LoadingContainer>
      <LoadingSpinner />
      <LoadingTitle>{t`Loading…`}</LoadingTitle>
    </LoadingContainer>
  );
}

export default NavbarLoadingView;
