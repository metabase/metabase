import cx from "classnames";
import {
  type ComponentProps,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useGetIcon } from "metabase/hooks/use-icon";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { useMetabotContext } from "metabase/metabot";
import { MetabotDatabaseSelect } from "metabase/metabot/components/MetabotChat/MetabotDatabaseSelect";
import { MetabotIcon } from "metabase/metabot/components/MetabotIcon";
import { MetabotModelSelector } from "metabase/metabot/components/MetabotModelSelector";
import {
  MetabotPromptInput,
  type MetabotPromptInputProps,
} from "metabase/metabot/components/MetabotPromptInput";
import { useEntityData } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { entityToUrlableModel } from "metabase/rich_text_editing/tiptap/extensions/shared/suggestionUtils";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { Box, Flex, Icon, Stack, Text, UnstyledButton } from "metabase/ui";
import { modelToUrl } from "metabase/urls/modelToUrl";
import type { MetabotUserIsViewingContext } from "metabase-types/api";

import S from "./MetabotChatEditor.module.css";

type MetabotChatEditorProps = Pick<
  MetabotPromptInputProps,
  | "value"
  | "placeholder"
  | "autoFocus"
  | "onChange"
  | "onSubmit"
  | "onStop"
  | "suggestionConfig"
> & {
  isResponding?: boolean;
  modelOverride?: string;
  onModelOverrideChange: (model: string | undefined) => void;
  selectedDatabaseId?: number;
  onSelectedDatabaseIdChange: (databaseId: number | undefined) => void;
};

type AttachedContext = MetabotUserIsViewingContext[number];

type AttachedEntity = {
  id?: number;
  model?: SuggestionModel;
  fallbackName: string;
  iconName?: ComponentProps<typeof EntityIcon>["name"];
};

const getAttachedEntity = (context: AttachedContext): AttachedEntity | null => {
  const id =
    "id" in context && typeof context.id === "number" ? context.id : undefined;
  const name = getEntityName(context, undefined);

  switch (context.type) {
    case "document":
      return { id, model: "document", fallbackName: name ?? t`Document` };
    case "dashboard":
      return { id, model: "dashboard", fallbackName: name ?? t`Dashboard` };
    case "model":
      return { id, model: "dataset", fallbackName: name ?? t`Model` };
    case "metric":
      return { id, model: "metric", fallbackName: name ?? t`Metric` };
    case "question":
      return { id, model: "card", fallbackName: name ?? t`Question` };
    case "adhoc":
      return { model: "card", fallbackName: name ?? t`Unsaved question` };
    case "transform":
      return {
        id,
        model: "transform",
        fallbackName: name ?? (id ? t`Transform` : t`Unsaved transform`),
      };
    case "code_editor":
      return { fallbackName: t`Code editor`, iconName: "code_block" };
    default:
      return null;
  }
};

const getEntityName = (entity: unknown, fallbackName: string | undefined) => {
  if (entity && typeof entity === "object") {
    if ("display_name" in entity && typeof entity.display_name === "string") {
      return entity.display_name;
    }

    if ("name" in entity && typeof entity.name === "string") {
      return entity.name;
    }
  }

  return fallbackName;
};

const AttachedContextPill = ({ context }: { context: AttachedContext }) => {
  const getIcon = useGetIcon();
  const attachedEntity = getAttachedEntity(context);
  const { entity, isLoading } = useEntityData(
    attachedEntity?.id ?? null,
    attachedEntity?.model ?? null,
  );

  if (!attachedEntity) {
    return null;
  }

  const name = getEntityName(entity, attachedEntity.fallbackName);
  const icon = attachedEntity.model
    ? getIcon({ model: attachedEntity.model })
    : { name: attachedEntity.iconName ?? "unknown" };
  const href =
    attachedEntity.id && attachedEntity.model
      ? modelToUrl(
          entityToUrlableModel(
            entity && typeof entity === "object"
              ? ({ ...entity, id: attachedEntity.id } as {
                  id: number;
                  name?: string;
                  db_id?: number;
                  database_id?: number;
                })
              : {
                  id: attachedEntity.id,
                  name,
                },
            attachedEntity.model,
          ),
        )
      : undefined;

  const content = (
    <>
      <EntityIcon {...icon} size="0.75rem" />
      <Text fw={700} fz="xs" lh="1rem" truncate>
        {isLoading ? attachedEntity.fallbackName : name}
      </Text>
    </>
  );

  if (!href) {
    return (
      <div className={S.attachedContext} data-testid="metabot-attached-context">
        {content}
      </div>
    );
  }

  return (
    <a
      href={href}
      className={cx(S.attachedContext, S.attachedContextLinked)}
      target="_blank"
      rel="noreferrer"
      data-testid="metabot-attached-context"
    >
      {content}
    </a>
  );
};

export const MetabotChatEditor = forwardRef<
  MetabotPromptInputRef | null,
  MetabotChatEditorProps
>(
  (
    {
      isResponding = false,
      modelOverride,
      onModelOverrideChange,
      selectedDatabaseId,
      onSelectedDatabaseIdChange,
      ...props
    },
    ref,
  ) => {
    const { getChatContext, chatContextProviderVersion } = useMetabotContext();
    const [attachedContexts, setAttachedContexts] =
      useState<MetabotUserIsViewingContext>([]);
    const attachedContextsKeyRef = useRef("");

    useEffect(
      function updateAttachedContext() {
        let isMounted = true;

        getChatContext()
          .then((context) => {
            if (isMounted) {
              const nextAttachedContexts = context.user_is_viewing.filter(
                (item) => getAttachedEntity(item) !== null,
              );
              const nextAttachedContextsKey = nextAttachedContexts
                .map((item) => {
                  const attachedEntity = getAttachedEntity(item);
                  return `${attachedEntity?.model}-${attachedEntity?.id}-${attachedEntity?.fallbackName}`;
                })
                .join(",");

              if (nextAttachedContextsKey !== attachedContextsKeyRef.current) {
                attachedContextsKeyRef.current = nextAttachedContextsKey;
                setAttachedContexts(nextAttachedContexts);
              }
            }
          })
          .catch((err) => {
            console.error("Failed to load metabot chat context:", err);
          });

        return () => {
          isMounted = false;
        };
      },
      [chatContextProviderVersion, getChatContext],
    );

    return (
      <Stack w="100%" gap={0}>
        {attachedContexts.length > 0 && (
          <Flex className={S.attachedContexts} gap="xs" wrap="wrap">
            {attachedContexts.map((context, index) => (
              <AttachedContextPill
                key={`${context.type}-${"id" in context ? context.id : index}`}
                context={context}
              />
            ))}
          </Flex>
        )}
        <Box className={S.contentWrapper}>
          <MetabotPromptInput
            {...props}
            ref={ref}
            disabled={isResponding}
            data-testid="metabot-chat-input"
          />
        </Box>
        <Flex align="center" gap="sm" h="2.5rem">
          <Box className={S.iconContainer}>
            <MetabotIcon c="brand" />
          </Box>
          <Box mr="auto">
            <MetabotDatabaseSelect
              value={selectedDatabaseId}
              onChange={onSelectedDatabaseIdChange}
              disabled={isResponding}
            />
          </Box>
          <MetabotModelSelector
            disabled={isResponding}
            dropdownPosition="top"
            modelOverride={modelOverride}
            onModelOverrideChange={onModelOverrideChange}
          />
          <UnstyledButton
            className={cx(S.button, isResponding && S.buttonResponding)}
            disabled={props.value.length === 0 || isResponding}
            onClick={isResponding ? props.onStop : props.onSubmit}
            data-testid={
              isResponding ? "metabot-stop-response" : "metabot-send-message"
            }
          >
            {isResponding ? (
              <Icon className={S.stopIcon} name="stop" />
            ) : (
              <Icon className={S.sendIcon} name="arrow_up" />
            )}
          </UnstyledButton>
        </Flex>
      </Stack>
    );
  },
);

// @ts-expect-error - must set a displayName
MetabotChatEditor.displayName = "MetabotChatEditor";
