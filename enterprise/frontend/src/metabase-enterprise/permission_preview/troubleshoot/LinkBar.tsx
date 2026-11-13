import { useEffect, useState } from "react";
import { t } from "ttag";

import { entityIdApi } from "metabase/api";
import {
  ActionIcon,
  Button,
  Group,
  Icon,
  Menu,
  Text,
  TextInput,
} from "metabase/ui";

import {
  NUMERIC_ID_TYPES,
  type NumericIdType,
  getEntityPath,
  getNumericIdPath,
  parseLinkInput,
} from "./item-path";

const ENTITY_ID_TYPES = ["card", "dashboard", "collection"] as const;

type LinkBarProps = {
  /** Where the frame is now; the bar follows it. */
  framePath: string;
  onOpen: (path: string) => void;
};

/** Opens a pasted link, path, entity id or numeric ID in the frame. */
export function LinkBar({ framePath, onOpen }: LinkBarProps) {
  const [text, setText] = useState(framePath);
  const [numericId, setNumericId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [translateEntityId, { isFetching }] =
    entityIdApi.useLazyTranslateEntityIdQuery();

  useEffect(() => {
    setText(framePath);
  }, [framePath]);

  const handleOpen = async () => {
    setError(null);
    const input = parseLinkInput(text);
    if (input == null) {
      return;
    }
    switch (input.kind) {
      case "path":
        onOpen(input.path);
        return;
      case "numeric-id":
        setNumericId(input.id);
        return;
      case "entity-id": {
        // the response is keyed by entity id, so each type needs its own request
        const responses = await Promise.all(
          ENTITY_ID_TYPES.map((type) =>
            translateEntityId({ [type]: [input.entityId] }),
          ),
        );
        const found = responses
          .flatMap(({ data }) => Object.values(data ?? {}))
          .find((result) => result.status === "ok");
        if (found?.id != null) {
          onOpen(getEntityPath(found.type, found.id));
        } else {
          setError(t`No question, dashboard or collection has this entity ID`);
        }
      }
    }
  };

  const handleNumericIdType = (type: NumericIdType) => {
    if (numericId != null) {
      onOpen(getNumericIdPath(type, numericId));
    }
    setNumericId(null);
  };

  return (
    <Group gap="xs" wrap="nowrap" flex={1}>
      <TextInput
        flex={1}
        size="xs"
        aria-label={t`Link, entity ID or ID`}
        placeholder={t`Paste a link, entity ID or ID`}
        value={text}
        error={error}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            handleOpen();
          }
        }}
        rightSection={
          text !== "" ? (
            <ActionIcon
              size="xs"
              aria-label={t`Clear`}
              onClick={() => setText("")}
            >
              <Icon name="close" />
            </ActionIcon>
          ) : null
        }
      />
      <Menu
        opened={numericId != null}
        onChange={(isOpened) => !isOpened && setNumericId(null)}
        position="bottom-end"
      >
        <Menu.Target>
          <Button
            size="compact-sm"
            variant="filled"
            loading={isFetching}
            onClick={handleOpen}
          >
            {t`Open`}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Text px="sm" py="xs" c="text-secondary" fz="sm">
            {t`Open ID ${numericId} as a`}
          </Text>
          {NUMERIC_ID_TYPES.map((type) => (
            <Menu.Item key={type} onClick={() => handleNumericIdType(type)}>
              {getNumericIdTypeName(type)}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

function getNumericIdTypeName(type: NumericIdType) {
  switch (type) {
    case "question":
      return t`Question`;
    case "dashboard":
      return t`Dashboard`;
    case "collection":
      return t`Collection`;
  }
}
