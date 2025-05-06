import { t } from "ttag";

import { color } from "metabase/lib/colors";
import {
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Radio,
  Stack,
  Switch,
  Text,
  Title,
} from "metabase/ui";

import type { ColorScheme } from "../../color-context";
import { useColors } from "../../color-context";

export function ColorTesterPage() {
  const {
    cardBackground,
    sideNavBackground,
    mainBackground,
    setCardBackground,
    setSideNavBackground,
    setMainBackground
  } = useColors();

  // This now actually changes the sidebar color through the context
  const handleSideNavChange = (value: string) => {
    setSideNavBackground(value as ColorScheme);
  };

  const handleCardBackgroundChange = (value: string) => {
    setCardBackground(value as ColorScheme);
  };

  const handleMainBackgroundChange = (value: string) => {
    setMainBackground(value as ColorScheme);
  };

  // Get the actual background color based on selection
  const getBackgroundColor = (selection: ColorScheme) => {
    return selection === "white" ? "white" : color("bg-light");
  };

  const cardBg = getBackgroundColor(cardBackground);

  return (
    <>
      <Title>{t`Color Tester`}</Title>
      <Text mb="xl">{t`This page allows you to test different color schemes for the admin UI components. Changes are applied to the actual UI.`}</Text>

      {/* Color Controls Card */}
      <Card p="xl" mt="xl" bg={cardBg} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Color Settings`}</Title>
        <Text mb="lg">{t`Adjust the visual design of navigation and card components.`}</Text>
        <Divider mb="xl" />

        <Stack gap="xl">
          <Box>
            <Text fw={600} mb="md">{t`Side Navigation Background`}</Text>
            <Radio.Group
              value={sideNavBackground}
              onChange={handleSideNavChange}
            >
              <Stack mt="xs">
                <Radio value="white" label={t`White Background`} />
                <Radio value="light-gray" label={t`Light Gray Background`} />
              </Stack>
            </Radio.Group>
          </Box>

          <Box>
            <Text fw={600} mb="md">{t`Main Content Area Background`}</Text>
            <Radio.Group
              value={mainBackground}
              onChange={handleMainBackgroundChange}
            >
              <Stack mt="xs">
                <Radio value="white" label={t`White Background`} />
                <Radio value="light-gray" label={t`Light Gray Background`} />
              </Stack>
            </Radio.Group>
          </Box>

          <Box>
            <Text fw={600} mb="md">{t`Card Background`}</Text>
            <Radio.Group
              value={cardBackground}
              onChange={handleCardBackgroundChange}
            >
              <Stack mt="xs">
                <Radio value="white" label={t`White Background`} />
                <Radio value="light-gray" label={t`Light Gray Background`} />
              </Stack>
            </Radio.Group>
          </Box>
        </Stack>
      </Card>

      {/* Card Design Preview */}
      <Card p="xl" mt="2rem" bg={cardBg} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Card Design Preview`}</Title>
        <Text mb="lg">{t`This card demonstrates how the selected background color looks.`}</Text>
        <Divider mb="xl" />

        <Stack gap="xl">
          <Group justify="space-between">
            <Box>
              <Text fw={600}>{t`Enable Feature`}</Text>
              <Text size="sm" c={color("text-medium")}>
                {t`This is an example toggle setting with the selected background color.`}
              </Text>
            </Box>
            <Switch size="md" />
          </Group>

          <Divider />

          <Box>
            <Text fw={600} mb="sm">{t`List Item Example`}</Text>
            <Box p="md" style={{ border: `1px solid ${color("border")}`, borderRadius: '4px' }}>
              <Group justify="space-between">
                <Group gap="md">
                  <Box style={{ width: '8px', height: '8px', borderRadius: '50%', background: color("success") }}></Box>
                  <Box>
                    <Text fw={600}>Example Item</Text>
                    <Text size="sm" c={color("text-medium")}>Last updated 2 hours ago</Text>
                  </Box>
                  <Badge color="green">Active</Badge>
                </Group>
                <Button variant="subtle" size="sm">{t`Action`}</Button>
              </Group>
            </Box>
          </Box>
        </Stack>
      </Card>

      {/* Side Navigation Preview */}
      <Card p="xl" mt="2rem" mb="2rem" bg={cardBg} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Side Navigation Preview`}</Title>
        <Text mb="lg">{t`The actual sidebar is now using the selected background color.`}</Text>
        <Divider mb="xl" />

        <Box p="md" style={{
          border: `1px solid ${color("border")}`,
          borderRadius: '4px',
          background: getBackgroundColor(sideNavBackground),
          width: '250px'
        }}>
          <Stack gap="sm">
            <Text size="sm" fw={600} mb="xs">{t`Navigation Preview`}</Text>
            <Box p="md" style={{
              borderRadius: '4px',
              backgroundColor: location.pathname.includes('color-tester') ? color("brand") + '20' : 'transparent'
            }}>
              <Group gap="md">
                <i className="fa fa-star" style={{ color: color(location.pathname.includes('color-tester') ? 'brand' : 'text-medium') }}/>
                <Text c={location.pathname.includes('color-tester') ? color('brand') : color('text-dark')}>Overview</Text>
              </Group>
            </Box>
            <Box p="md" style={{ borderRadius: '4px' }}>
              <Group gap="md">
                <i className="fa fa-gear" style={{ color: color('text-medium') }}/>
                <Text>Settings</Text>
              </Group>
            </Box>
            <Box p="md" style={{ borderRadius: '4px' }}>
              <Group gap="md">
                <i className="fa fa-palette" style={{ color: color('text-medium') }}/>
                <Text>Appearance</Text>
              </Group>
            </Box>
          </Stack>
        </Box>
      </Card>

      {/* Content Area Preview */}
      <Card p="xl" mt="2rem" mb="2rem" bg={cardBg} withBorder shadow="none">
        <Title order={2} mb="xs">{t`Layout Preview`}</Title>
        <Text mb="lg">{t`This shows how all the selected colors work together.`}</Text>
        <Divider mb="xl" />

        <Box p="xl" style={{
          border: `1px solid ${color("border")}`,
          borderRadius: '4px',
          position: 'relative',
          height: '180px'
        }}>
          <Box style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '60px',
            background: getBackgroundColor(sideNavBackground),
            borderRight: `1px solid ${color("border")}`,
            borderTopLeftRadius: '4px',
            borderBottomLeftRadius: '4px'
          }} />

          <Box style={{
            position: 'absolute',
            left: '60px',
            right: 0,
            top: 0,
            bottom: 0,
            background: getBackgroundColor(mainBackground),
            padding: '20px',
            borderTopRightRadius: '4px',
            borderBottomRightRadius: '4px'
          }}>
            <Box style={{
              width: '100%',
              height: '100%',
              background: getBackgroundColor(cardBackground),
              border: `1px solid ${color("border")}`,
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Text c={color("text-medium")}>Card content</Text>
            </Box>
          </Box>
        </Box>

        <Text size="sm" mt="md" c={color("text-medium")}>
          {t`Try different combinations of sidebar, main content, and card backgrounds to find the most visually appealing design.`}
        </Text>
      </Card>
    </>
  );
}
