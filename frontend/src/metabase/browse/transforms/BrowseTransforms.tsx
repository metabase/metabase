import { t } from "ttag";

import { useListTransformsQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Flex, Group, Icon, Stack, Title } from "metabase/ui";

import {
  BrowseContainer,
  BrowseHeader,
  BrowseMain,
  BrowseSection,
} from "../components/BrowseContainer.styled";

import { TransformsTable } from "./TransformsTable";

export function BrowseTransforms() {
  const { data: transforms, error, isLoading } = useListTransformsQuery();

  return (
    <BrowseContainer>
      <BrowseHeader role="heading" data-testid="browse-transforms-header">
        <BrowseSection>
          <Flex
            w="100%"
            h="2.25rem"
            direction="row"
            justify="space-between"
            align="center"
          >
            <Title order={2} c="text-dark">
              <Group gap="sm">
                <Icon
                  size={24}
                  color="var(--mb-color-icon-primary)"
                  name="function"
                />
                {t`Transforms`}
              </Group>
            </Title>
          </Flex>
        </BrowseSection>
      </BrowseHeader>
      <BrowseMain>
        <BrowseSection>
          <Stack mb="lg" gap="md" w="100%">
            <DelayedLoadingAndErrorWrapper
              error={error}
              loading={isLoading}
              style={{ flex: 1 }}
              loader={<TransformsTable skeleton />}
            >
              <TransformsTable transforms={transforms} />
            </DelayedLoadingAndErrorWrapper>
          </Stack>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
}
