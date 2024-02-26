import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Icon, Text } from "metabase/ui";

import {
  LoadingAndErrorContainer,
  LoadingAndErrorContent,
} from "./MainNavbar.styled";

export function NavbarErrorView() {
  return (
    <LoadingAndErrorContainer>
      <LoadingAndErrorContent>
        <Icon name="warning" size={24} />
        <Text
          fw={400}
          mt="0.5rem"
          color={color("text-light")}
          size="lg"
        >{t`An error occurred`}</Text>
      </LoadingAndErrorContent>
    </LoadingAndErrorContainer>
  );
}
