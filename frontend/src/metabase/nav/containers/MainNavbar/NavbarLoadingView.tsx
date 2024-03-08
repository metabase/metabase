import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";

import {
  LoadingAndErrorContainer,
  LoadingAndErrorContent,
  LoadingAndErrorTitle,
} from "./MainNavbar.styled";

export function NavbarLoadingView() {
  return (
    <LoadingAndErrorContainer>
      <LoadingAndErrorContent>
        <LoadingSpinner />
        <LoadingAndErrorTitle>{t`Loading…`}</LoadingAndErrorTitle>
      </LoadingAndErrorContent>
    </LoadingAndErrorContainer>
  );
}
