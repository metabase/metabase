import { t } from "ttag";

import { ColorSelector } from "metabase/core/components/ColorSelector";
import { colors } from "metabase/lib/colors";
import {
  ActionIcon,
  Card,
  Checkbox,
  Divider,
  Group,
  Icon,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

import { EXAMPLE_PARAMETERS } from "../constants";
import type { EmbedPreviewOptions } from "../types";

interface ConfigureStepProps {
  options: EmbedPreviewOptions;
  onOptionsChange: (options: Partial<EmbedPreviewOptions>) => void;
}

export const ConfigureStep = ({
  options,
  onOptionsChange,
}: ConfigureStepProps) => (
  <Stack gap="md">
    <Card p="md">
      <Text size="lg" fw="bold" mb="md">
        {t`Behavior`}
      </Text>
      <Stack gap="md">
        <Checkbox
          label={t`Allow users to drill through on data points`}
          checked={options.dashboardOptions?.isDrillThroughEnabled ?? false}
          onChange={(e) =>
            onOptionsChange({
              dashboardOptions: {
                ...options.dashboardOptions,
                isDrillThroughEnabled: e.target.checked,
              },
            })
          }
        />
        <Checkbox
          label={t`Allow downloads`}
          checked={options.dashboardOptions?.withDownloads ?? false}
          onChange={(e) =>
            onOptionsChange({
              dashboardOptions: {
                ...options.dashboardOptions,
                withDownloads: e.target.checked,
              },
            })
          }
        />
      </Stack>
    </Card>

    <Card p="md">
      <Text size="lg" fw="bold" mb="xs">
        {t`Parameters`}
      </Text>
      <Text size="sm" c="text-medium" mb="lg">
        {t`Set default values and control visibility`}
      </Text>
      <Stack gap="md">
        {EXAMPLE_PARAMETERS.map((param) => (
          <TextInput
            key={param.id}
            label={param.name}
            placeholder={param.placeholder}
            rightSection={
              <ActionIcon variant="subtle">
                <Icon name="eye" size={16} />
              </ActionIcon>
            }
          />
        ))}
      </Stack>
    </Card>

    <Card p="md">
      <Text size="lg" fw="bold" mb="lg">
        {t`Appearance`}
      </Text>
      <Group align="start" gap="xl" mb="lg">
        <Stack gap="xs" align="start">
          <Text size="sm" fw="bold">
            {t`Brand Color`}
          </Text>
          <ColorSelector
            value={options.colors?.brand || colors.brand}
            colors={Object.values(colors)}
            onChange={(color) =>
              onOptionsChange({
                colors: { ...options.colors, brand: color },
              })
            }
          />
        </Stack>
        <Stack gap="xs" align="start">
          <Text size="sm" fw="bold">
            {t`Text Color`}
          </Text>
          <ColorSelector
            value={options.colors?.["text-primary"] || colors["text-dark"]}
            colors={Object.values(colors)}
            onChange={(color) =>
              onOptionsChange({
                colors: { ...options.colors, "text-primary": color },
              })
            }
          />
        </Stack>
        <Stack gap="xs" align="start">
          <Text size="sm" fw="bold">
            {t`Background`}
          </Text>
          <ColorSelector
            value={options.colors?.background || colors.white}
            colors={Object.values(colors)}
            onChange={(color) =>
              onOptionsChange({
                colors: { ...options.colors, background: color },
              })
            }
          />
        </Stack>
      </Group>
      <Divider mb="lg" />
      <Checkbox
        label={t`Show dashboard title`}
        checked={options.dashboardOptions?.withTitle ?? true}
        onChange={(e) =>
          onOptionsChange({
            dashboardOptions: {
              ...options.dashboardOptions,
              withTitle: e.target.checked,
            },
          })
        }
      />
    </Card>
  </Stack>
);
