import { useState } from "react";
import { t } from "ttag";

import {
  Box,
  Code,
  Flex,
  ScrollArea,
  SegmentedControl,
  Text,
} from "metabase/ui";
import type { GitFileContent } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { QueryView } from "../transforms/components/QueryView/QueryView";

interface FileContentViewerProps {
  content: GitFileContent;
}

export const FileContentViewer = ({ content }: FileContentViewerProps) => {
  const [viewMode, setViewMode] = useState<"source" | "preview">(
    content.entityType ? "preview" : "source",
  );

  const canShowEntity = content.entityType && content.entity;

  return (
    <Flex h="100%" direction="column">
      <Flex
        p="md"
        align="center"
        justify="space-between"
        style={{
          borderBottom: "1px solid var(--mb-color-border)",
        }}
      >
        <Text size="md" c="text-medium">
          {content.path}
        </Text>
        {canShowEntity && (
          <SegmentedControl
            value={viewMode}
            onChange={(value) => setViewMode(value as "source" | "preview")}
            data={[
              { label: t`Source`, value: "source" },
              { label: t`Preview`, value: "preview" },
            ]}
            size="xs"
          />
        )}
      </Flex>
      <ScrollArea h="100%">
        {viewMode === "source" || !canShowEntity ? (
          <Box maw="900px" mx="auto" p="md">
            <Code block p="md" style={{ fontSize: "13px", lineHeight: 1.6 }}>
              {content.content}
            </Code>
          </Box>
        ) : (
          <Box p="md">
            {content.entityType === "transform" && (
              <QueryView query={(content.entity as Transform).source.query} />
            )}
          </Box>
        )}
      </ScrollArea>
    </Flex>
  );
};
