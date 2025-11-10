import { useState } from "react";
import { t } from "ttag";

import { useGetExportSetQuery } from "metabase/api/representations";
import {
  Code,
  Collapse,
  Group,
  Icon,
  Loader,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import type { CardType } from "metabase-types/api";

type EntityType =
  | CardType
  | "transform"
  | "document"
  | "collection"
  | "timeline";

interface RepresentationsModalProps {
  opened: boolean;
  onClose: () => void;
  entityId: number | null;
  entityType: EntityType;
}

function DependencyItem({ yaml, index }: { yaml: string; index: number }) {
  const [isOpen, setIsOpen] = useState(false);

  // Extract the first few lines to show type, name, and ref
  const lines = yaml.split("\n");
  const typeLine = lines.find((line) => line.startsWith("type:"));
  const nameLine = lines.find((line) => line.startsWith("name:"));
  const refLine = lines.find((line) => line.startsWith("ref:"));

  const type = typeLine?.split(":")[1]?.trim() || "Unknown";
  const name = nameLine?.split(":")[1]?.trim() || `Dependency ${index + 1}`;
  const ref = refLine?.split(":")[1]?.trim();

  return (
    <Stack gap="xs">
      <Group
        onClick={() => setIsOpen((x) => !x)}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <Icon name={isOpen ? "chevrondown" : "chevronright"} size={16} />
        <Text fw="bold">
          {type}: {name} {ref && `(${ref})`}
        </Text>
      </Group>
      <Collapse in={isOpen}>
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
      </Collapse>
    </Stack>
  );
}

export function RepresentationsModal({
  opened,
  onClose,
  entityId,
  entityType,
}: RepresentationsModalProps) {
  const { data, isLoading, error } = useGetExportSetQuery(
    { type: entityType, id: entityId! },
    { skip: !opened || entityId === null },
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
            {t`Error loading representation: ${(error as Error).message}`}
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
            {data.yamls.length > 1 && (
              <>
                <Text fw="bold" mt="md">{t`Dependencies`}</Text>
                {data.yamls.slice(1).map((yaml, index) => (
                  <DependencyItem key={index} yaml={yaml} index={index} />
                ))}
              </>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
