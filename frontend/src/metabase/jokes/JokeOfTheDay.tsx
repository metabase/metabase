import { useGetJokeQuery } from "metabase/api/joke";
import { Card, Text, Title } from "metabase/ui";

export function JokeOfTheDay() {
  const { data: joke, isLoading } = useGetJokeQuery();

  if (!joke || isLoading) {
    return null;
  }

  return (
    <Card p="lg" my="lg" bd="1px solid var(--mb-color-border)">
      <Title order={3}>😂</Title>
      <Text fw="bold">{joke.setup}</Text>
      <Text>{joke.punchline}</Text>
    </Card>
  );
}
