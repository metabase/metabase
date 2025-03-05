"use client";
import ButtonDocs from "./docs.mdx";
import { LiveEditor, LivePreview, LiveProvider } from "react-live";

import { Box, Button, Card } from "metabase/ui";

function CodeTest({ children }) {
  const scope = { Box, Button };
  return (
    <LiveProvider code={children} scope={scope} disabled>
      <Box p="md">
        <LivePreview />
      </Box>
      <Card p="0">
        <LiveEditor />
      </Card>
    </LiveProvider>
  );
}

const components = {
  code: CodeTest,
};

export default function Page() {
  // @ts-ignore
  return <ButtonDocs components={components} />;
}
