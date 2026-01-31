import { Badge, Flex, Text } from "metabase/ui";
import type { InspectorV2LensSummary } from "metabase-types/api";

type LensSummaryProps = {
  summary: InspectorV2LensSummary;
};

export const LensSummary = ({ summary }: LensSummaryProps) => {
  const { text, highlights } = summary;

  if (!text && (!highlights || highlights.length === 0)) {
    return null;
  }

  return (
    <Flex gap="md" align="center" wrap="wrap">
      {text && <Text c="text-secondary">{text}</Text>}
      {highlights?.map((highlight, index) => (
        <Badge key={index} variant="light" size="lg">
          {highlight.label}: {String(highlight.value ?? "-")}
        </Badge>
      ))}
    </Flex>
  );
};
