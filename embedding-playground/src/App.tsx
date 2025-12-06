import {
  Button,
  Checkbox,
  Group,
  Input,
  InputLabel,
  List,
  Modal,
  Radio,
  RadioGroup,
  Stack,
  Tabs,
} from "@mantine/core";
import { observer } from "mobx-react-lite";
import { ReactSDK } from "./sdk/sdk.tsx";
import { store, type Component, type EmbeddingType } from "./store.ts";

import "./App.css";
import { useState } from "react";

const App = observer(() => {
  return (
    <>
      <Stack gap="md">
        <Group gap="md">
          <InputLabel>
            Metabase URL:
            <Input
              value={store.metabaseInstanceUrl}
              onChange={(e) => (store.metabaseInstanceUrl = e.target.value)}
            />
          </InputLabel>
          <Instructions />
        </Group>
        <RadioGroup
          value={store.component}
          onChange={(value) => (store.component = value as Component)}
        >
          <Group gap="md">
            <Radio label="New Question" value="new-question" />
            <Radio label="Question" value="question" />
            <Radio label="Dashboard" value="dashboard" />
            <Radio label="Collection Browser" value="collection-browser" />
          </Group>
        </RadioGroup>
        <Group gap="md">
          <InputLabel>
            Question ID:
            <Input
              value={store.questionIdString}
              onChange={(e) => (store.questionIdString = e.target.value)}
            />
          </InputLabel>
          <InputLabel>
            Dashboard ID:
            <Input
              value={store.dashboardIdString}
              onChange={(e) => (store.dashboardIdString = e.target.value)}
            />
          </InputLabel>
          <Checkbox
            label="Force Staged Data Picker"
            checked={store.forceStagedDataPicker}
            onChange={(e) => (store.forceStagedDataPicker = e.target.checked)}
          />
        </Group>
      </Stack>
      <Tabs
        value={store.embeddingType}
        onChange={(value: string | null) =>
          (store.embeddingType = value as EmbeddingType)
        }
      >
        <Tabs.List>
          <Tabs.Tab value="sdk">React SDK</Tabs.Tab>
          <Tabs.Tab value="eajs">EAJS</Tabs.Tab>
          <Tabs.Tab value="interactive">Interactive SDK</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="sdk">
          <ReactSDK key={store.metabaseInstanceUrl} />
        </Tabs.Panel>
        <Tabs.Panel value="eajs">TODO</Tabs.Panel>
        <Tabs.Panel value="interactive">TODO</Tabs.Panel>
      </Tabs>
    </>
  );
});

export default App;

const Instructions = () => {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Button onClick={() => setOpened(true)}>Instructions</Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Instructions"
      >
        <List>
          <List.Item>
            enable all embedding types in{" "}
            <a
              href="http://localhost:3000/admin/embedding/modular"
              target="_blank"
            >
              the settings
            </a>
          </List.Item>
          <List.Item>
            <a
              href="http://localhost:3000/admin/settings/authentication/jwt"
              target="_blank"
            >
              enable JWT
            </a>{" "}
            and use the secret key in <code>src/server.ts</code>
            <code>src/server.ts</code>
          </List.Item>
          <List.Item>
            If using tenants, remember to give them the appropriate permissions
            to the resources and db
          </List.Item>
        </List>
      </Modal>
    </>
  );
};
