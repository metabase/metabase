/* eslint-disable metabase/no-color-literals -- storybook demo */
/* eslint-disable metabase/no-literal-metabase-strings -- storybook demo */
/* eslint-disable i18next/no-literal-string -- storybook demo */
import Color from "color";
import { useCallback, useState } from "react";
import { match } from "ts-pattern";

import { Box, Group, Stack, Text } from "metabase/ui";
import { suggestHarmonyColors } from "metabase/ui/colors/harmonies";

import { HarmonyWheel } from "./HarmonyWheel";
import { Swatch } from "./Swatch";

type HslChannel = "hue" | "saturationl" | "lightness";

export function ColorHarmonyDemo() {
  const [brand, setBrand] = useState("#509EE2");
  const c = Color(brand);
  const harmony = suggestHarmonyColors(brand);

  const handleHsl = useCallback(
    (channel: HslChannel) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.currentTarget.value);
      const next = match(channel)
        .with("hue", () => c.hue(value))
        .with("saturationl", () => c.saturationl(value))
        .with("lightness", () => c.lightness(value))
        .exhaustive();
      setBrand(next.hex().toLowerCase());
    },
    [c],
  );

  return (
    <Box p={48} style={{ background: "#fafafa", minHeight: "100vh" }}>
      <Stack gap="xl" maw={1180} mx="auto">
        <Stack gap="md">
          <Text fz={28} fw={700}>
            Color Harmony
          </Text>
          <Text c="text-secondary" maw={620}>
            Square harmony places filter and summarize on the perpendicular axes
            from the brand. Octagonal harmony spreads the eight chart colors at
            45° increments. Positive and negative anchor to fixed hues.
          </Text>
        </Stack>

        <Group align="flex-start" gap={48} wrap="wrap">
          <HarmonyWheel brand={brand} onBrandChange={setBrand} />

          <Stack gap="xl" miw={260} style={{ flex: 1 }}>
            <BrandSummary brand={brand} onBrandChange={setBrand} />

            <HslSlider
              label="Hue"
              value={Math.round(c.hue())}
              max={359}
              valueLabel={`${Math.round(c.hue())}°`}
              onChange={handleHsl("hue")}
            />
            <HslSlider
              label="Saturation"
              value={Math.round(c.saturationl())}
              max={100}
              valueLabel={`${Math.round(c.saturationl())}%`}
              onChange={handleHsl("saturationl")}
            />
            <HslSlider
              label="Lightness"
              value={Math.round(c.lightness())}
              max={100}
              valueLabel={`${Math.round(c.lightness())}%`}
              onChange={handleHsl("lightness")}
            />

            <Text size="xs" c="text-secondary" lh={1.5}>
              Drag the hue ring to rotate the brand, or use the sliders. Click
              the swatch above to pick an exact hex. Saturation under 20% falls
              back to a fixed default palette.
            </Text>

            <Stack gap="sm">
              <Text size="xs" fw={600} c="text-secondary">
                Resolved palette
              </Text>
              <Group gap="md" wrap="wrap">
                <Swatch label="Filter" hex={harmony.filter} size={20} />
                <Swatch label="Summarize" hex={harmony.summarize} size={20} />
                <Swatch label="Positive" hex={harmony.positive} size={20} />
                <Swatch label="Negative" hex={harmony.negative} size={20} />
              </Group>
              <Box style={{ height: 1, background: "rgba(0,0,0,0.08)" }} />
              <Group gap="md" wrap="wrap">
                {harmony.charts.map((chart, i) => (
                  <Swatch
                    key={i}
                    label={`Chart ${i + 1}`}
                    hex={chart}
                    size={20}
                  />
                ))}
              </Group>
            </Stack>

            <Stack gap="xs">
              <Text size="xs" fw={600} c="text-secondary">
                Where this is used
              </Text>
              <Text size="xs" c="text-secondary" lh={1.5}>
                The embedding theme editor (Admin → Embedding → Themes) lets
                admins create named themes that their customers&apos; embedded
                Metabase will adopt. Hand-picking twelve colors that work
                together is tedious and easy to get wrong, so the editor seeds
                the secondary palette from the brand color via this harmony:
                filter and summarize sit on perpendicular axes (square), charts
                1–8 fan out at 45° (octagonal), and positive/negative anchor to
                fixed green/red hues at lightness 50.
              </Text>
            </Stack>
          </Stack>
        </Group>
      </Stack>
    </Box>
  );
}

function BrandSummary({
  brand,
  onBrandChange,
}: {
  brand: string;
  onBrandChange: (next: string) => void;
}) {
  const c = Color(brand);
  return (
    <Stack gap={6}>
      <Text size="sm" fw={600} c="text-secondary">
        Brand color
      </Text>
      <Group gap="sm" align="center">
        <Box
          component="label"
          w={48}
          h={48}
          style={{
            background: brand,
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.08)",
            cursor: "pointer",
            position: "relative",
            overflow: "hidden",
            flexShrink: 0,
          }}
          title="Click to pick a color"
        >
          <input
            type="color"
            value={brand}
            onChange={(e) => onBrandChange(e.currentTarget.value)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: "pointer",
              border: "none",
              padding: 0,
            }}
          />
        </Box>
        <Stack gap={0}>
          <Text fw={600} ff="monospace">
            {brand}
          </Text>
          <Text size="xs" c="text-secondary">
            {`hsl(${Math.round(c.hue())}°, ${Math.round(c.saturationl())}%, ${Math.round(c.lightness())}%)`}
          </Text>
        </Stack>
      </Group>
    </Stack>
  );
}

function HslSlider({
  label,
  value,
  max,
  valueLabel,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  valueLabel: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Stack gap="xs">
      <Group gap="xs" justify="space-between">
        <Text size="xs" fw={600} c="text-secondary">
          {label}
        </Text>
        <Text size="xs" c="text-secondary" ff="monospace">
          {valueLabel}
        </Text>
      </Group>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={onChange}
        style={{ width: "100%" }}
      />
    </Stack>
  );
}
