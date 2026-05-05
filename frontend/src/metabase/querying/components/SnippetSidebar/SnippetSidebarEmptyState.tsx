import { c, t } from "ttag";

import EmptySnippet from "assets/img/empty-states/snippet.svg";
import { Box, Button, Icon, Stack, Text, Title } from "metabase/ui";

export const SnippetSidebarEmptyState = ({
  onClick,
  areSnippetsReadOnly,
}: {
  onClick: () => void;
  areSnippetsReadOnly?: boolean;
}) => {
  return (
    <Box p="lg" mt="5rem">
      <Stack align="center" ta="center" gap="lg">
        <Box maw="6rem">
          <img src={EmptySnippet} alt={t`Code snippet bot illustration`} />
        </Box>

        {areSnippetsReadOnly ? (
          <Text fz="md">{t`No snippets to show.`}</Text>
        ) : (
          <>
            <Box>
              <Title
                order={2}
                size="lg"
                mb="sm"
              >{t`Save time with reusable bits of code`}</Title>
              <Text fz="md">
                {c("{0} is the left arrow icon")
                  .jt`Create a snippet from scratch or select and right-click existing code. Then use the ${(
                  <Icon
                    name="arrow_left_to_line"
                    key="snippet-icon"
                    style={{ verticalAlign: "middle" }}
                  />
                )} button to add it to your query.`}
              </Text>
            </Box>

            <Button variant="subtle" onClick={onClick}>
              {t`Create snippet`}
            </Button>
          </>
        )}
      </Stack>
    </Box>
  );
};
