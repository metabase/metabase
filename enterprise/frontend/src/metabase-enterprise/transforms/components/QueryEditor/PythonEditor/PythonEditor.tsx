import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { Box, Button, Group, Text } from "metabase/ui";

type PythonEditorProps = {
  script: string;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  onChange: (script: string) => void;
  onRunScript: () => Promise<void>;
  onCancelScript: () => void;
};

export function PythonEditor({
  script,
  isRunnable,
  isRunning,
  isResultDirty,
  onChange,
  onRunScript,
  onCancelScript,
}: PythonEditorProps) {
  const handleScriptChange = (newScript: string) => {
    onChange(newScript);
  };

  return (
    <Box h="100%" style={{ display: "flex", flexDirection: "column" }}>
      {/* Python Script Editor */}
      <Box style={{ flex: 1 }}>
        <CodeEditor
          value={script}
          onChange={handleScriptChange}
          language="python"
        />
      </Box>

      {/* Action Buttons */}
      <Box mt="md">
        <Group gap="sm">
          <Button
            variant="filled"
            leftSection={isRunning ? undefined : <span>▶</span>}
            onClick={isRunning ? onCancelScript : onRunScript}
            disabled={!isRunnable && !isRunning}
            loading={isRunning}
          >
            {isRunning ? t`Cancel` : t`Run Python Script`}
          </Button>
          {isResultDirty && (
            <Text size="sm" c="dimmed">
              {t`Results may be out of date`}
            </Text>
          )}
        </Group>
      </Box>
    </Box>
  );
}
