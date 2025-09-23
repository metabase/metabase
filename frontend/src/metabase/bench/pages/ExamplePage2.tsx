import { Badge, Card, Container, Grid, Text, Title } from "@mantine/core";

export function ExamplePage2() {
  return (
    <Container>
      <Title order={1} mb="md">
        Example Page 2
      </Title>
      <Text mb="lg">
        This is the second example page showcasing a different layout with
        cards and badges using Mantine components.
      </Text>
      <Grid>
        <Grid.Col span={6}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text fw={500} size="lg" mb="xs">
              Feature Card 1
            </Text>
            <Text size="sm" c="dimmed" mb="sm">
              This card demonstrates Mantine's card component with shadow and border.
            </Text>
            <Badge color="blue" variant="light">
              New Feature
            </Badge>
          </Card>
        </Grid.Col>
        <Grid.Col span={6}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text fw={500} size="lg" mb="xs">
              Feature Card 2
            </Text>
            <Text size="sm" c="dimmed" mb="sm">
              Another example card showing how multiple components work together.
            </Text>
            <Badge color="green" variant="light">
              Stable
            </Badge>
          </Card>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
