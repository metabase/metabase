import { type KeyboardEvent, useEffect, useState } from "react";
import { t } from "ttag";

import { entityIdApi } from "metabase/api/entity-id";
import {
  NOT_FOUND_ITEM,
  getItemFromLink,
} from "metabase/embedding/permission-preview/item";
import { useDispatch, useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Icon, Loader, Menu, TextInput } from "metabase/ui";
import {
  type BaseEntityId,
  isBaseEntityID,
} from "metabase-types/api/entity-id";

interface AddressBoxProps {
  linkText: string;
  // changes each time the frame loads again, even at the same path
  frameKey: string | null;
  onOpen: (item: string, linkText: string) => void;
}

const NEGATIVE = "var(--mb-color-feedback-negative)";

const ITEM_TYPES = [
  { type: "question", label: () => t`Question` },
  { type: "dashboard", label: () => t`Dashboard` },
  { type: "collection", label: () => t`Collection` },
] as const;

/**
 * Shows the path of what the frame shows, and opens what is typed in it: a
 * Metabase link or path, an entity ID, or a numeric ID (asks which item has it).
 */
export function AddressBox({ linkText, frameKey, onOpen }: AddressBoxProps) {
  const dispatch = useDispatch();
  const applicationName = useSelector(getApplicationName);
  const [draft, setDraft] = useState(linkText);
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [numericId, setNumericId] = useState<string | null>(null);

  useEffect(() => {
    setDraft(linkText);
    setError(null);
  }, [linkText, frameKey]);

  async function open() {
    const text = draft.trim();
    setError(null);

    if (/^\d+$/.test(text)) {
      setNumericId(text);
    } else if (isBaseEntityID(text)) {
      await openEntityId(text);
    } else {
      const item = getItemFromLink(text);
      if (item === NOT_FOUND_ITEM) {
        setError(
          t`Paste a ${applicationName} link, an entity ID, or a numeric ID.`,
        );
      } else {
        onOpen(item, text);
      }
    }
  }

  async function openEntityId(entityId: BaseEntityId) {
    setIsResolving(true);
    // one request per kind: the answer is keyed by entity ID, so one request
    // for every kind would let a kind with no match replace the one with it
    const results = await Promise.all(
      (["card", "dashboard", "collection"] as const).map((type) =>
        dispatch(
          entityIdApi.endpoints.translateEntityId.initiate({
            [type]: [entityId],
          }),
        ),
      ),
    );
    setIsResolving(false);

    const found = results
      .map((result) => result.data?.[entityId])
      .find((answer) => answer?.status === "ok");
    if (found?.status === "ok") {
      const type = found.type === "card" ? "question" : found.type;
      onOpen(`${type}/${found.id}`, `/${type}/${found.id}`);
    } else {
      setError(t`No question, dashboard, or collection has this entity ID.`);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      open();
    }
  }

  function openNumericId(type: (typeof ITEM_TYPES)[number]["type"]) {
    onOpen(`${type}/${numericId}`, `/${type}/${numericId}`);
    setNumericId(null);
  }

  return (
    <Menu
      opened={numericId != null}
      position="bottom-end"
      onClose={() => setNumericId(null)}
    >
      <Menu.Target>
        <TextInput
          flex="1 1000000 24rem"
          miw="12rem"
          styles={{
            input: { fontSize: "var(--mantine-font-size-xs)" },
            wrapper: error ? { "--input-border-color": NEGATIVE } : undefined,
            error: { color: NEGATIVE },
          }}
          aria-label={t`Address`}
          placeholder={t`Paste a link, entity ID, or ID`}
          leftSection={<Icon name="link" />}
          rightSection={
            isResolving ? (
              <Loader size="xs" />
            ) : (
              <Icon name="enter_or_return" c="text-secondary" />
            )
          }
          error={error}
          value={draft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
        />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t`Which item has ID ${numericId}?`}</Menu.Label>
        {ITEM_TYPES.map(({ type, label }) => (
          <Menu.Item key={type} onClick={() => openNumericId(type)}>
            {label()}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
