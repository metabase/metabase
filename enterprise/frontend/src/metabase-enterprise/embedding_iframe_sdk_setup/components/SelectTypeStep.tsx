import { t } from "ttag";

import { Card, Radio, Stack, Text } from "metabase/ui";

import { EMBED_TYPES } from "../constants";
import type { EmbedType } from "../types";

interface SelectTypeStepProps {
  selectedType: EmbedType;
  onTypeChange: (type: EmbedType) => void;
}

export const SelectTypeStep = ({
  selectedType,
  onTypeChange,
}: SelectTypeStepProps) => (
  <Card p="md" mb="md">
    <Text size="lg" fw="bold" mb="md">
      {t`Select your embed experience`}
    </Text>
    <Radio.Group
      value={selectedType}
      onChange={(value) => onTypeChange(value as EmbedType)}
    >
      <Stack gap="md">
        {EMBED_TYPES.map((type) => (
          <Radio
            key={type.value}
            value={type.value}
            label={type.title}
            description={type.description}
          />
        ))}
      </Stack>
    </Radio.Group>
  </Card>
);
