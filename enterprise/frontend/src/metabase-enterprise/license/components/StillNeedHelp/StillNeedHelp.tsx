import styled from "@emotion/styled";
import { t } from "ttag";

import { Anchor, Text } from "metabase/ui";

const Container = styled.div`
  background: var(--mb-color-background-secondary);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin-top: 1.5rem;
`;

const Title = styled.div`
  color: var(--mb-color-text-secondary);
  font-weight: bold;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
`;

export const StillNeedHelp = () => {
  return (
    <Container>
      <Title>{t`Still need help?`}</Title>
      <Text c="text-secondary">
        {t`You can ask for billing help at `}
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Anchor href="mailto:billing@metabase.com">billing@metabase.com</Anchor>
      </Text>
    </Container>
  );
};
