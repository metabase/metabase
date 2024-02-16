import { t } from "ttag";
import { Icon } from "metabase/ui";
import {
  LoadingAndErrorContainer,
  LoadingAndErrorContent,
  LoadingAndErrorTitle,
} from "./MainNavbar.styled";

export function NavbarErrorView() {
  return (
    <LoadingAndErrorContainer>
      <LoadingAndErrorContent>
        <Icon name="warning" size={32} />
        <LoadingAndErrorTitle>{t`An error occurred`}</LoadingAndErrorTitle>
      </LoadingAndErrorContent>
    </LoadingAndErrorContainer>
  );
}
