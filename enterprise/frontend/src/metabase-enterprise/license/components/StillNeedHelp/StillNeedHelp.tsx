import styled from "@emotion/styled";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Text, Anchor } from "metabase/ui";

const Container = styled.div`
  background: ${color("bg-light")};
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin-top: 1.5rem;
`;

const Title = styled.div`
  color: ${color("text-medium")};
  font-weight: bold;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
`;

export const StillNeedHelp = () => {
  return (
    <Container>
      <Title>{t`Still need help?`}</Title>
      <Text color="text-medium">
        {t`You can ask for billing help at `}
        <Anchor href="mailto:billing@metabase.com">billing@metabase.com</Anchor>
      </Text>
    </Container>
  );
};
