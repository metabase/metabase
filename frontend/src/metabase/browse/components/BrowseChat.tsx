import { t } from "ttag";
import { Flex, Group, Stack, Title } from "metabase/ui";
import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
} from "./BrowseContainer.styled";
import WebSocketHandler from "metabase/query_builder/components/WebSocketHandler";

export const BrowseChat = () => {
  return (
    <BrowseContainer>
      <BrowseHeader>
        <BrowseSection>
          <Flex
            w="100%"
            h="2.25rem"
            direction="row"
            justify="space-between"
            align="center"
          >
            <Title order={1} color="text-dark">
              <Group spacing="sm">{t`Ask a question`}</Group>
            </Title>
          </Flex>
        </BrowseSection>
      </BrowseHeader>
      <BrowseMain>
        <BrowseSection>
          <Stack mb="lg" spacing="xs" w="100%">
            <WebSocketHandler />
          </Stack>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};
