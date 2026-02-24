import { useGetJokeQuery } from "metabase/api/joke";
import { Box, Text, Title } from "metabase/ui";

export function JokeOfTheDay() {
  const { data: joke, isLoading } = useGetJokeQuery();

  if (!joke || isLoading) {
    return null;
  }

  return (
    <Box py="lg">
      <Title>😂</Title>
      <Text fw="bold">{joke.setup}</Text>
      <Text>{joke.punchline}</Text>
    </Box>
  );
}
