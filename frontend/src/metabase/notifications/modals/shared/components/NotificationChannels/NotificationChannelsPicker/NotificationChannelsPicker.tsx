import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { jt, t } from "ttag";

import { useListChannelsQuery, useListUserRecipientsQuery } from "metabase/api";
import { CodeBlock } from "metabase/components/CodeBlock";
import { getNotificationHandlersGroupedByTypes } from "metabase/lib/notifications";
import { useSelector } from "metabase/lib/redux";
import { ChannelSettingsBlock } from "metabase/notifications/channels/ChannelSettingsBlock";
import { EmailChannelEdit } from "metabase/notifications/channels/EmailChannelEdit";
import { SlackChannelFieldNew } from "metabase/notifications/channels/SlackChannelFieldNew";
import {
  type ChannelToAddOption,
  NotificationChannelsAddMenu,
} from "metabase/notifications/modals/shared/components/NotificationChannels/NotificationChannelsAddMenu";
import { TemplateEditor } from "metabase/notifications/modals/shared/components/TemplateEditor/TemplateEditor";
import { canAccessSettings, getUser } from "metabase/selectors/user";
import {
  Accordion,
  Flex,
  Icon,
  Popover,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type {
  ChannelApiResponse,
  NotificationChannelKey,
  NotificationHandler,
  SlackChannelSpec,
  User,
} from "metabase-types/api";

import S from "./NotificationChannelsPicker.module.css";

const DEFAULT_CHANNELS_CONFIG = {
  email: { name: t`Email`, type: "email" },
  slack: { name: t`Slack`, type: "slack" },
};
type SupportedChannelKey = Extract<NotificationChannelKey, "email" | "slack">;

// Template state types
interface TemplateState {
  templates: {
    email: { subject: string; body: string } | null;
    // For simplicity, use same structure for Slack, but in future we'll need to introduce proper interface for each channel.
    slack: { subject: string; body: string } | null;
  };
}

type TemplateAction =
  | {
      type: "INITIALIZE_TEMPLATE";
      payload: TemplateState;
    }
  | {
      type: "UPDATE_TEMPLATE";
      channel: SupportedChannelKey;
      field: "subject" | "body";
      value: string;
    }
  | {
      type: "REMOVE_TEMPLATE";
      channel: SupportedChannelKey;
    };

const templateReducer = (
  state: TemplateState,
  action: TemplateAction,
): TemplateState => {
  switch (action.type) {
    case "INITIALIZE_TEMPLATE":
      return action.payload;
    case "UPDATE_TEMPLATE":
      return {
        ...state,
        templates: {
          ...state.templates,
          [action.channel]: {
            subject: "",
            body: "",
            ...state.templates[action.channel],
            [action.field]: action.value,
          },
        },
      };
    case "REMOVE_TEMPLATE": {
      return {
        ...state,
        templates: {
          ...state.templates,
          [action.channel]: null,
        },
      };
    }
    default:
      return state;
  }
};

const templateTypeMap = {
  "channel/email": {
    name: t`Email template`,
    type: "email/handlebars-text",
    stateKey: "email" as const,
  },
  "channel/slack": {
    name: t`Slack template`,
    type: "slack/handlebars-text",
    stateKey: "slack" as const,
  },
};

const getTemplateContent = (
  handler: NotificationHandler,
  templates: TemplateState["templates"],
) => {
  const channelType = handler.channel_type as keyof typeof templateTypeMap;
  const stateKey = templateTypeMap[channelType]
    ?.stateKey as SupportedChannelKey;
  return templates[stateKey];
};

const defaultGetInvalidRecipientText = (domains: string) =>
  t`Some of the recipients have addresses outside of the allowed domains: ${domains}`;

interface NotificationChannelsPickerProps {
  notificationHandlers: NotificationHandler[];
  channels: ChannelApiResponse["channels"] | undefined;
  onChange: (newHandlers: NotificationHandler[]) => void;
  getInvalidRecipientText?: (domains: string) => string;
  enableTemplates?: boolean;
  formattedJsonTemplate?: string;
  defaultTemplates?: Record<
    string,
    {
      channel_type: string;
      details: {
        type: string;
        subject?: string;
        body: string;
      };
    }
  > | null;
}

interface TemplateHelperTooltipProps {
  formattedJson?: string;
}

const TemplateHelperTooltip = ({
  formattedJson = "",
}: TemplateHelperTooltipProps) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      position="right"
      withArrow
      shadow="md"
      width={400}
      opened={open}
      trapFocus
      onChange={setOpen}
    >
      <Popover.Target>
        <Flex
          direction="column"
          onClickCapture={(e) => {
            // This icon is placed inside a clickable accordion header, so we need to prevent default behavior
            // to avoid triggering the accordion toggle.
            e.preventDefault();
            e.stopPropagation();
            setOpen(!open);
          }}
          style={{ alignSelf: "end", cursor: "pointer" }}
        >
          <Tooltip label={t`Template instructions`}>
            <Icon name="question" size={14} />
          </Tooltip>
        </Flex>
      </Popover.Target>
      <Popover.Dropdown p="sm" px="md" onClick={(e) => e.stopPropagation()}>
        <Text>{jt`We support ${(
          <a
            key="link"
            href="https://handlebarsjs.com/guide/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--mb-color-brand)",
              textDecoration: "underline",
            }}
          >
            Handlebars
          </a>
        )} templates.`}</Text>
        <Text>{jt`Use ${(<code key="brackets">{"{{ }}"}</code>)} to reference fields, ${(<code key="key">{"@key"}</code>)} and ${(<code key="value">{"@value"}</code>)} when iterating over objects, or ${(<code key="index">{"@index"}</code>)} for arrays.`}</Text>
        <Text>{t`Example payload for selected alert:`}</Text>
        <br />
        <div
          style={{
            margin: 0,
            maxHeight: "25rem",
            overflowY: "auto",
          }}
        >
          <CodeBlock language="json" code={formattedJson} />
        </div>
      </Popover.Dropdown>
    </Popover>
  );
};

export const NotificationChannelsPicker = ({
  notificationHandlers,
  channels: nullableChannels,
  onChange,
  getInvalidRecipientText = defaultGetInvalidRecipientText,
  enableTemplates = false,
  formattedJsonTemplate = "",
  defaultTemplates,
}: NotificationChannelsPickerProps) => {
  const { data: httpChannelsConfig = [] } = useListChannelsQuery();
  const { data: users } = useListUserRecipientsQuery();
  const user = useSelector(getUser);
  const userCanAccessSettings = useSelector(canAccessSettings);

  const usersListOptions: User[] = users?.data || (user ? [user] : []);

  const channels = (nullableChannels ||
    DEFAULT_CHANNELS_CONFIG) as ChannelApiResponse["channels"];

  const { emailHandler, slackHandler, hookHandlers } =
    getNotificationHandlersGroupedByTypes(notificationHandlers);

  const hasEmailChannel = !!channels.email?.configured && !!emailHandler;
  const hasSlackChannel = !!channels.slack?.configured && !!slackHandler;

  // TODO: Create an abstraction to validate only required fields, when we introduce webhooks.
  const [validationErrors, setValidationErrors] = useState({
    email: { subject: false, body: false },
    slack: { subject: false, body: false },
  });

  const initialTemplateState: TemplateState = useMemo(() => {
    const templates: TemplateState["templates"] = {
      email: null,
      slack: null,
    };

    notificationHandlers.forEach((handler) => {
      if (handler.template?.details) {
        const { channel_type, details } = handler.template;
        const handlerChannelType = channel_type as keyof typeof templateTypeMap;
        const stateKey = templateTypeMap[handlerChannelType]?.stateKey;
        if (!stateKey) {
          return;
        }
        const hasContent = details.subject?.trim() || details.body?.trim();
        if (hasContent) {
          if (stateKey === "email") {
            templates.email = {
              subject: details.subject || "",
              body: details.body || "",
            };
          } else if (stateKey === "slack") {
            templates.slack = {
              subject: "",
              body: details.body || "",
            };
          }
        }
      } else if (
        handler.channel_type &&
        defaultTemplates &&
        defaultTemplates[handler.channel_type]
      ) {
        // Use default template if available and no template is set
        const stateKey =
          templateTypeMap[handler.channel_type as keyof typeof templateTypeMap]
            ?.stateKey;
        const details = defaultTemplates[handler.channel_type]?.details;
        if (stateKey && details) {
          if (stateKey === "email") {
            templates.email = {
              subject: details.subject || "",
              body: details.body || "",
            };
          } else if (stateKey === "slack") {
            templates.slack = {
              subject: "",
              body: details.body || "",
            };
          }
        }
      }
    });

    return { templates };
  }, [notificationHandlers, defaultTemplates]);

  const [templateState, dispatch] = useReducer(
    templateReducer,
    initialTemplateState,
  );
  // Re-initialize template state if handlers change externally
  useEffect(() => {
    dispatch({ type: "INITIALIZE_TEMPLATE", payload: initialTemplateState });
    setValidationErrors({
      email: { subject: false, body: false },
      slack: { subject: false, body: false },
    });
  }, [initialTemplateState]);

  const addChannel = useCallback(
    (channel: ChannelToAddOption) => {
      let newChannel: NotificationHandler;

      switch (channel.type) {
        case "channel/http": {
          newChannel = {
            channel_type: channel.type,
            channel_id: channel.channel_id,
            recipients: [],
          };
          break;
        }
        case "channel/email": {
          newChannel = {
            channel_type: channel.type,
            recipients: user
              ? [
                  {
                    type: "notification-recipient/user",
                    user_id: user.id,
                    details: null,
                  },
                ]
              : [],
          };
          break;
        }
        case "channel/slack": {
          newChannel = {
            channel_type: channel.type,
            recipients: [],
          };
          break;
        }
      }

      onChange(notificationHandlers.concat(newChannel));
    },
    [notificationHandlers, onChange, user],
  );

  const onChannelChange = useCallback(
    (oldConfig: NotificationHandler, newConfig: NotificationHandler) => {
      const updatedChannels = notificationHandlers.map((value) =>
        value === oldConfig ? newConfig : value,
      );
      onChange(updatedChannels);
    },
    [notificationHandlers, onChange],
  );

  const onRemoveChannel = useCallback(
    (channel: NotificationHandler) => {
      const updatedChannels = notificationHandlers.filter(
        (value) => value !== channel,
      );

      if (enableTemplates) {
        if (channel.channel_type === "channel/email") {
          dispatch({ type: "REMOVE_TEMPLATE", channel: "email" });
          setValidationErrors((prev) => ({
            ...prev,
            email: { subject: false, body: false },
          }));
        } else if (channel.channel_type === "channel/slack") {
          dispatch({ type: "REMOVE_TEMPLATE", channel: "slack" });
          setValidationErrors((prev) => ({
            ...prev,
            slack: { subject: false, body: false },
          }));
        }
      }

      onChange(updatedChannels);
    },
    [notificationHandlers, onChange, enableTemplates, dispatch],
  );

  const updateTemplateForChannel = (
    channelKey: SupportedChannelKey,
    state = templateState,
  ) => {
    if (!enableTemplates) {
      return;
    }

    const updatedHandlers = notificationHandlers.map((handler) => {
      const handlerChannelType =
        handler.channel_type as keyof typeof templateTypeMap;
      const templateConfig = templateTypeMap[handlerChannelType];

      if (templateConfig.stateKey !== channelKey) {
        return handler;
      }

      const templateContent = getTemplateContent(handler, state.templates);

      const isRemovingTemplate = state.templates[channelKey] === null;

      if (isRemovingTemplate) {
        if (handler.template) {
          const { template, template_id, ...restHandler } = handler;
          return {
            ...restHandler,
            template: null,
            template_id: null,
          };
        } else {
          return handler;
        }
      }
      if (!templateContent) {
        return handler; // Should not happen if not removing, but safety check
      }

      const newTemplateDetails: {
        type: string;
        subject?: string;
        body?: string;
      } = {
        type: templateConfig.type,
      };

      if (handlerChannelType === "channel/slack") {
        newTemplateDetails.body = templateContent.body;
      } else {
        newTemplateDetails.subject = templateContent.subject;
        newTemplateDetails.body = templateContent.body;
      }

      const newTemplate = {
        ...(handler.template_id && { id: handler.template_id }),
        name: templateConfig.name,
        channel_type: handlerChannelType,
        details: newTemplateDetails,
      };

      return { ...handler, template: newTemplate };
    });

    // Only call onChange if the array of handlers has actually changed
    if (
      JSON.stringify(updatedHandlers) !== JSON.stringify(notificationHandlers)
    ) {
      onChange(updatedHandlers as NotificationHandler[]);
    }
  };

  const handleTemplateBlur = (
    channel: SupportedChannelKey,
    field: "subject" | "body",
    value: string,
  ) => {
    const updateAction: TemplateAction = {
      type: "UPDATE_TEMPLATE",
      channel,
      field,
      value,
    };
    const stateAfterUpdateAction = templateReducer(templateState, updateAction);
    const template = stateAfterUpdateAction.templates[channel];
    const subjectValue = template?.subject || "";
    const bodyValue = template?.body || "";

    const hasSubject = !!subjectValue.trim();
    const hasBody = !!bodyValue.trim();
    let shouldUpdate = false;
    let shouldRemove = false;
    const isCurrentTemplateNull = template === null;

    if (channel === "email") {
      const bothEmpty = !hasSubject && !hasBody;
      const bothFilled = hasSubject && hasBody;
      const subjectInvalid = !hasSubject && hasBody;
      const bodyInvalid = hasSubject && !hasBody;

      setValidationErrors((prev) => ({
        ...prev,
        email: { subject: subjectInvalid, body: bodyInvalid },
      }));

      if (bothEmpty) {
        shouldRemove = !isCurrentTemplateNull;
      } else if (bothFilled) {
        shouldUpdate = true;
      }
    } else {
      // Slack
      // No validation, since it's always valid (either empty of filled)
      if (!hasBody) {
        shouldRemove = !isCurrentTemplateNull;
      } else {
        shouldUpdate = true;
      }
    }

    if (shouldRemove) {
      const removeAction: TemplateAction = { type: "REMOVE_TEMPLATE", channel };
      dispatch(removeAction);
      const stateAfterRemoveAction = templateReducer(
        stateAfterUpdateAction,
        removeAction,
      );
      updateTemplateForChannel(channel, stateAfterRemoveAction);
      return;
    } else if (shouldUpdate) {
      updateTemplateForChannel(channel, stateAfterUpdateAction);
    }

    dispatch(updateAction);
  };

  const getTemplateValue = (
    channel: SupportedChannelKey,
    field: "subject" | "body",
  ): string => {
    return templateState.templates[channel]?.[field] || "";
  };

  const parsedTemplateContext = useMemo(() => {
    if (!formattedJsonTemplate) {
      return undefined;
    }
    try {
      return JSON.parse(formattedJsonTemplate);
    } catch (e) {
      console.error("Failed to parse template context JSON:", e);
      return undefined;
    }
  }, [formattedJsonTemplate]);

  return (
    <Stack gap="xl" align="start" w="100%">
      {/* Email Channel */}
      {hasEmailChannel && (
        <ChannelSettingsBlock
          title={t`Email`}
          iconName="mail"
          onRemoveChannel={() => onRemoveChannel(emailHandler)}
        >
          <EmailChannelEdit
            channel={emailHandler}
            users={usersListOptions}
            invalidRecipientText={getInvalidRecipientText}
            onChange={(newConfig) => onChannelChange(emailHandler, newConfig)}
          />
          {enableTemplates && (
            <Accordion
              classNames={{
                root: S.customTemplateRoot,
                control: S.customTemplateControl,
                label: S.customTemplateLabel,
                icon: S.customTemplateIcon,
              }}
              defaultValue={
                templateState.templates.email ? "email-template" : null
              }
            >
              <Accordion.Item value="email-template">
                <Accordion.Control>
                  <Flex align="center" gap="sm">
                    {t`Custom email template`}
                    <TemplateHelperTooltip
                      formattedJson={formattedJsonTemplate}
                    />
                  </Flex>
                </Accordion.Control>
                <Accordion.Panel styles={{ content: { padding: 0 } }}>
                  <Stack>
                    <Stack gap="xs">
                      <Text size="sm" fw={700}>{t`Subject`}</Text>
                      <TemplateEditor
                        variant="textinput"
                        placeholder={t`Alert from {{payload.result.table.name}} table`}
                        templateContext={parsedTemplateContext} // Pass parsed context
                        defaultValue={getTemplateValue("email", "subject")}
                        onBlur={(newValue) => {
                          handleTemplateBlur("email", "subject", newValue);
                        }}
                        error={
                          validationErrors.email.subject
                            ? t`Subject cannot be empty`
                            : false
                        }
                        language="mustache"
                      />
                    </Stack>
                    <Stack gap="xs">
                      <Text size="sm" fw={700}>{t`Content`}</Text>
                      <TemplateEditor
                        variant="textarea"
                        placeholder={t`Your custom email template`}
                        templateContext={parsedTemplateContext} // Pass parsed context
                        minHeight="12rem"
                        defaultValue={getTemplateValue("email", "body")}
                        onBlur={(newValue) => {
                          handleTemplateBlur("email", "body", newValue);
                        }}
                        error={
                          validationErrors.email.body
                            ? t`Content cannot be empty`
                            : false
                        }
                        language="mustache"
                      />
                    </Stack>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          )}
        </ChannelSettingsBlock>
      )}

      {/* Slack Channel */}
      {hasSlackChannel && (
        <ChannelSettingsBlock
          title={t`Slack`}
          iconName="int"
          onRemoveChannel={() => onRemoveChannel(slackHandler)}
        >
          <SlackChannelFieldNew
            channel={slackHandler}
            channelSpec={channels.slack as SlackChannelSpec}
            onChange={(newConfig) => onChannelChange(slackHandler, newConfig)}
          />
          {enableTemplates && (
            <Accordion
              classNames={{
                root: S.customTemplateRoot,
                control: S.customTemplateControl,
                label: S.customTemplateLabel,
                icon: S.customTemplateIcon,
              }}
              defaultValue={
                templateState.templates.slack ? "slack-template" : null
              }
            >
              <Accordion.Item value="slack-template">
                <Accordion.Control>
                  <Flex align="center" gap="sm">
                    {t`Custom Slack message`}
                    <TemplateHelperTooltip
                      formattedJson={formattedJsonTemplate}
                    />
                  </Flex>
                </Accordion.Control>
                <Accordion.Panel styles={{ content: { padding: 0 } }}>
                  <Stack gap="xs">
                    <Text size="sm" fw={700}>{t`Content`}</Text>
                    <TemplateEditor
                      placeholder={t`Your custom Markdown template`}
                      templateContext={parsedTemplateContext} // Pass parsed context
                      minHeight="12rem"
                      defaultValue={getTemplateValue("slack", "body")}
                      onBlur={(newValue) => {
                        handleTemplateBlur("slack", "body", newValue);
                      }}
                      language="markdown"
                    />
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          )}
        </ChannelSettingsBlock>
      )}

      {/* Webhook Channels */}
      {userCanAccessSettings &&
        hookHandlers &&
        hookHandlers.map((channel) => (
          <ChannelSettingsBlock
            key={`webhook-${channel.channel_id}`}
            title={
              httpChannelsConfig.find(({ id }) => id === channel.channel_id)
                ?.name || t`Webhook`
            }
            iconName="webhook"
            onRemoveChannel={() => onRemoveChannel(channel)}
          >
            <Text>{t`Webhooks are managed in Admin Settings.`}</Text>
            {/* NOTE: Templates are not currently supported for webhooks in this setup */}
          </ChannelSettingsBlock>
        ))}

      {/* Add Channel Menu */}
      <NotificationChannelsAddMenu
        notificationHandlers={notificationHandlers}
        channelsSpec={channels}
        httpChannelsConfig={httpChannelsConfig}
        onAddChannel={addChannel}
        userCanAccessSettings={userCanAccessSettings}
      />
    </Stack>
  );
};
