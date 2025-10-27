import { useGetExportSetQuery } from "metabase/api/representations";
import { Code, Loader, Modal, Stack, Text } from "metabase/ui";

interface RepresentationsModalProps {
  opened: boolean;
  onClose: () => void;
  questionId: number | null;
}

export function RepresentationsModal({
  opened,
  onClose,
  questionId,
}: RepresentationsModalProps) {
  const { data, isLoading, error } = useGetExportSetQuery(
    { type: "question", id: questionId! },
    { skip: !opened || questionId === null },
  );

  return (
    <Modal opened={opened} onClose={onClose} title="Representation" size="xl">
      <Stack>
        {isLoading && (
          <Stack align="center" p="xl">
            <Loader size="lg" />
            <Text c="text-medium">Loading representation...</Text>
          </Stack>
        )}

        {error && (
          <Text c="error">
            Error loading representation: {(error as Error).message}
          </Text>
        )}

        {data && (
          <>
            <Code
              block
              style={{
                maxHeight: "600px",
                overflow: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {data.yamls[0]}
            </Code>
            <div>Dependencies</div>
            {data.yamls.slice(1).map((yaml) => (
              <>
                <Code
                  block
                  style={{
                    maxHeight: "600px",
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {yaml}
                </Code>
              </>
            ))}
          </>
        )}
      </Stack>
    </Modal>
  );
}
