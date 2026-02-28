import { useGetJokeQuery } from "metabase/api/joke";
import { Box, Card, Flex, Text, Title } from "metabase/ui";

export function JokeOfTheDay() {
  const { data: joke, isLoading } = useGetJokeQuery();

  if (!joke || isLoading) {
    return null;
  }

  return (
    <Card
      p="lg"
      my="lg"
      bd="1px solid var(--mb-color-border)"
      data-testid="joke-of-the-day"
    >
      <Flex align="center" gap="lg">
        <Title order={1}>😂</Title>
        <Box>
          <Text fw="bold">{joke.setup}</Text>
          <Text>{joke.punchline}</Text>
        </Box>
      </Flex>
    </Card>
  );
}
