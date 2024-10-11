"use client";
import { Box, Button, Text, Title } from "metabase/ui";

export default function Home() {
  return (
    <Box mt={400}>
      <Title size={40}>Metabase's Design System</Title>
      <Text maw={600} mt="md">
        This is the documentation for our design system. It's meant to help
        designers and developers who work on Metabase understand how and why to
        apply patterns and make certain design choices in the product.
      </Text>
      <Box mt="lg">
        <a
          href="https://metaboat.slack.com/archives/C057WD5L0JG"
          target="_blank"
        >
          <Button mr="md">#design-system on Slack</Button>
        </a>
        <Button>Github</Button>
      </Box>
    </Box>
  );
}
