"use client";
import Docs from "./docs.mdx";
import { LiveEditor, LivePreview, LiveProvider, LiveError } from "react-live";
import { Box, Button, Card, Icon, Menu, Modal, Text } from "metabase/ui";
import { Badge, Code, Indicator } from "@mantine/core";

function CodeTest({ children }) {
  const scope = {
    Badge,
    Box,
    Code,
    Button,
    Menu,
    Modal,
    Indicator,
    Icon,
    Text,
  };
  return (
    <LiveProvider code={children} scope={scope} disabled>
      <Box p="md">
        <LivePreview />
      </Box>
      <Card p="0">
        <LiveEditor />
        <LiveError />
      </Card>
    </LiveProvider>
  );
}

const components = {
  code: CodeTest,
};

export default function Page() {
  // @ts-ignore
  return <Docs components={components} />;
}
