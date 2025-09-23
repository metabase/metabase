import { Container } from "@mantine/core";

import { Button, Group, Text, Title } from "metabase/ui";

export function ExamplePage1() {
  return (
    <Container>
      <Title order={1} mb="md">
        Example Page 1
      </Title>
      <Text mb="lg">
        This is the first example page in the bench section. It demonstrates a
        simple page layout using Mantine components outside of the main Metabase
        app structure.
      </Text>
      <Group>
        <Button variant="filled">Primary Action</Button>
        <Button variant="outline">Secondary Action</Button>
      </Group>
    </Container>
  );
}
