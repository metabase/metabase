import { useMount } from "react-use";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import {
  ActionIcon,
  Box,
  Card,
  Group,
  Icon,
  Stack,
  Text,
  Title,
} from "metabase/ui";

const COMPONENTS = [
  {
    title: "Main Heading",
    slug: "h1",
  },
  {
    title: "Paragraph",
    slug: "p",
  },
  {
    title: "List",
    slug: "list",
  },
  {
    title: "Card",
    slug: "card",
  },
  {
    title: "Table",
    slug: "table",
  },
  {
    title: "Form",
    slug: "form",
  },
];

type DataAppContainerProps = {
  params: {
    appId: string;
  };
};

export const DataAppContainer = ({
  params: { appId },
}: DataAppContainerProps) => {
  const dispatch = useDispatch();

  useMount(() => {
    dispatch(closeNavbar());
  });

  return (
    <Stack mih="100%" h="0" gap={0}>
      <Box bg="white">
        <Title order={4} m="1rem 2rem">
          {t`${appId || "New"} Data App`}
        </Title>
      </Box>
      <Group
        bg="var(--mb-color-bg-light)"
        align="stretch"
        style={{
          flexGrow: 1,
        }}
      >
        <Box
          style={{
            borderRight: "1px solid var(--mb-color-border)",
          }}
        >
          <Group bg="white" p="1rem" align="center" mb="1rem">
            <Title order={4}>{t`Components Sidebar`}</Title>
            <ActionIcon>
              <Icon name="close" />
            </ActionIcon>
          </Group>

          <Stack px="1rem">
            {COMPONENTS.map(({ title, slug }) => (
              <Card key={slug}>
                <Text fw={500}>{title}</Text>
              </Card>
            ))}
          </Stack>
        </Box>
        <Box>Canvas here</Box>
      </Group>
    </Stack>
  );
};
