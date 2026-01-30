import { useEffect, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Box,
  Card,
  Center,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { fetchTransformLens } from "../mock-api";
import type { LensCard, TransformLensResponse } from "../mock-types";

import { ComparisonCard } from "./InspectColumnComparisons/ComparisonCard";

type TransformInspectLensProps = {
  transformId: number;
  lensId: string;
};

export const TransformInspectLens = ({
  transformId,
  lensId,
}: TransformInspectLensProps) => {
  const [data, setData] = useState<TransformLensResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    fetchTransformLens(transformId, lensId)
      .then((response) => {
        setData(response);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err);
        setIsLoading(false);
      });
  }, [transformId, lensId]);

  if (isLoading || error) {
    return (
      <Center h="200px">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (data == null) {
    return null;
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>{data["display-name"]}</Title>
        <Text c="text-secondary" size="sm">
          {data.layout === "comparison" ? t`Comparison view` : t`Flat view`}
        </Text>
      </Group>

      {data.summary && (
        <Card withBorder p="md">
          <Stack gap="sm">
            <Text>{data.summary.text}</Text>
            {data.summary.highlights.length > 0 && (
              <Group gap="xl">
                {data.summary.highlights.map((highlight) => (
                  <Stack key={highlight["card-id"]} gap="xs">
                    <Text size="sm" c="text-secondary">
                      {highlight.label}
                    </Text>
                    <Text fw="bold" size="lg">
                      {highlight.value ?? "-"}
                    </Text>
                  </Stack>
                ))}
              </Group>
            )}
          </Stack>
        </Card>
      )}

      {data.sections.map((section) => {
        const sectionCards = data.cards.filter(
          (card) => card["section-id"] === section.id,
        );
        if (sectionCards.length === 0) {
          return null;
        }
        return (
          <Stack key={section.id} gap="sm">
            <Title order={4}>{section.title}</Title>
            <SimpleGrid cols={sectionCards.length} spacing="md">
              {sectionCards.map((card) => (
                <LensCardRenderer key={card.id} card={card} />
              ))}
            </SimpleGrid>
          </Stack>
        );
      })}
    </Stack>
  );
};

type LensCardRendererProps = {
  card: LensCard;
};

const LensCardRenderer = ({ card }: LensCardRendererProps) => {
  // Convert LensCard to the format expected by ComparisonCard
  const comparisonCard = {
    id: card.id,
    source: "output" as const,
    table_name: "",
    field_name: "",
    title: card.title,
    display: card.display,
    dataset_query: card.dataset_query,
  };

  return (
    <Box>
      <Text fw="bold" mb="xs">
        {card.title}
      </Text>
      <ComparisonCard card={comparisonCard} />
    </Box>
  );
};
