import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";

import {
  LoadingContainer,
  LoadingContent,
  LoadingTitle,
} from "./MainNavbar.styled";

function NavbarLoadingView() {
  return (
    <LoadingContainer>
      <LoadingContent>
        <LoadingSpinner />
        <LoadingTitle>{t`Loading…`}</LoadingTitle>
      </LoadingContent>
    </LoadingContainer>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NavbarLoadingView;
