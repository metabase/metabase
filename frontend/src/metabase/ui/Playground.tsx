import { Code } from "@mantine/core";
import { Box, Stack, Text, Group, Button } from "metabase/ui";

const MANTINE_GROUP_CODE = `
<Group spacing="lg" p="lg">
    <Button>Button A</Button>
    <Button>Button B</Button>
    <Button>Button C</Button>
</Group>
`;
const BAD_GROUP_CODE = `
<div style="display: flex; flex-direction: row; gap: 1rem; padding: 1rem; align-items: center; justify-content: flex-start;">
    <Button>Button A</Button>
    <Button>Button B</Button>
    <Button>Button C</Button>
</div>
`;

const MANTINE_STACK_CODE = `
<Stack spacing="lg" p="lg">
    <Button>Button A</Button>
    <Button>Button B</Button>
    <Button>Button C</Button>
</Stack>
`;
const BAD_STACK_CODE = `
<div style="display: flex; flex-direction: column; gap: 1rem; padding: 1rem; align-items: center; justify-content: flex-start;">
    <Button>Button A</Button>
    <Button>Button B</Button>
    <Button>Button C</Button>
</div>
`;

export const Playground = () => {
  return (
    <Stack px="20vw" py="5vh">
      <Text size="xl" weight={700}>
        What is Mantine?
      </Text>
      <Code fs="10rem">import {"{...} from 'metabase/ui';"}</Code>

      <Text size="lg" weight={700}>
        Mantine is a way for us to standardize styles, props, and component
        usage, while reducing lines of code and improving developer speed and
        happiness.
      </Text>

      <hr />

      <Box>
        <h1>Layouts</h1>
        <Stack>
          <h2>Groups</h2>
          <Group spacing="lg" p="lg">
            <Button>Button A</Button>
            <Button>Button B</Button>
            <Button>Button C</Button>
          </Group>
          <Group noWrap spacing="xl">
            <pre>{MANTINE_GROUP_CODE}</pre>
            <pre>{BAD_GROUP_CODE}</pre>
          </Group>
        </Stack>

        <Stack>
          <h2>Stacks</h2>
          <Stack spacing="lg" p="lg">
            <Button>Button A</Button>
            <Button>Button B</Button>
            <Button>Button C</Button>
          </Stack>
          <Group noWrap spacing="xl">
            <pre>{MANTINE_STACK_CODE}</pre>
            <pre>{BAD_STACK_CODE}</pre>
          </Group>
        </Stack>
      </Box>

      <Box py="10rem">
        <h2>
          All of the styles are provided for you, so you only need to make minor
          adjustments if you need them.
        </h2>
        <h3>
          For example, if you want to make a button with no background, you can
          do this:
        </h3>
        <pre>
          import {"{Button} from 'metabase/ui';"}
          {`<Button variant='subtle'>Button A</Button>`}
        </pre>
        <Button variant="subtle">Button A</Button>
      </Box>

      <Stack spacing="lg">
        <Box>
          <h2>
            Want to make logical separations of html blocks without creating a
            div/styled emotion soup? Use <Code>Box</Code>
          </h2>

          <pre>
            {`
            <Box p="lg" bg="brand">
              <Text color="white">
                This is a box with padding and a background color
              </Text>
            </Box>
        `}
          </pre>
          <Box p="lg" bg="brand">
            <Text color="white">
              This is a box with padding and a background color
            </Text>
          </Box>
        </Box>

        <Box>
          <h3>
            This is the same as using a <Code>div</Code> and styled-components:
          </h3>
          <pre>
            {`
        // In JSX:

        <FancyDiv style="padding: 1rem; background-color: #509EE3;">
            <Text color="white">
              This is a box with padding and a background color
            </Text>
        </FancyDiv>

        `}

            {`
        // In styled-components:

        const FancyDiv = styled.div\`
          padding: 1rem;
          background-color: #509EE3;
        \``}
          </pre>
          <div style={{ padding: "1rem", backgroundColor: "#509EE3" }}>
            <Text color="white">
              This is a box with padding and a background color
            </Text>
          </div>
        </Box>
      </Stack>
    </Stack>
  );
};
