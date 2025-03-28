import { useEffect, useMemo, useReducer, useState } from "react";
import { t } from "ttag";

import { useListChannelsQuery, useListUserRecipientsQuery } from "metabase/api";
import { getNotificationHandlersGroupedByTypes } from "metabase/lib/notifications";
import { useSelector } from "metabase/lib/redux";
import { ChannelSettingsBlock } from "metabase/notifications/channels/ChannelSettingsBlock";
import { EmailChannelEdit } from "metabase/notifications/channels/EmailChannelEdit";
import { SlackChannelFieldNew } from "metabase/notifications/channels/SlackChannelFieldNew";
import {
  type ChannelToAddOption,
  NotificationChannelsAddMenu,
} from "metabase/notifications/modals/shared/components/NotificationChannels/NotificationChannelsAddMenu";
import { canAccessSettings, getUser } from "metabase/selectors/user";
import {
  Box,
  Button,
  Flex,
  Stack,
  Tabs,
  TextInput,
  Textarea,
} from "metabase/ui";
import type {
  ChannelApiResponse,
  NotificationHandler,
  User,
} from "metabase-types/api";

const DEFAULT_CHANNELS_CONFIG = {
  email: { name: t`Email`, type: "email" },
  slack: { name: t`Slack`, type: "slack" },
};

// Template state types
interface TemplateState {
  activeTab: string | null;
  templates: {
    email: { subject: string; body: string } | null;
    slack: { subject: string; body: string } | null;
  };
}

// Template actions
type TemplateAction =
  | { type: "SET_ACTIVE_TAB"; tab: string | null }
  | {
      type: "UPDATE_TEMPLATE";
      channel: "email" | "slack";
      field: "subject" | "body";
      value: string;
    }
  | { type: "REMOVE_TEMPLATE"; channel: "email" | "slack" };

interface NotificationChannelsPickerProps {
  notificationHandlers: NotificationHandler[];
  channels: ChannelApiResponse["channels"] | undefined;
  onChange: (newHandlers: NotificationHandler[]) => void;
  emailRecipientText: string;
  getInvalidRecipientText: (domains: string) => string;
  enableTemplates?: boolean;
}
interface TemplateInputsProps {
  templateState: TemplateState;
  dispatch: React.Dispatch<TemplateAction>;
  updateTemplateForActiveChannel: () => void;
}

const TemplateInputs = ({
  templateState,
  dispatch,
  updateTemplateForActiveChannel,
}: TemplateInputsProps) => {
  // Track validation state for both fields
  const [validationErrors, setValidationErrors] = useState({
    subject: false,
    body: false,
  });

  const activeChannel = templateState.activeTab as "email" | "slack";

  // Return null if no active channel
  if (!activeChannel) {
    return null;
  }

  const getTemplateValue = (field: "subject" | "body") => {
    return templateState.templates[activeChannel]?.[field] || "";
  };

  const subjectValue = getTemplateValue("subject");
  const bodyValue = getTemplateValue("body");

  const handleUpdate = (field: "subject" | "body", value: string) => {
    dispatch({
      type: "UPDATE_TEMPLATE",
      channel: activeChannel,
      field,
      value,
    });

    if (validationErrors[field]) {
      setValidationErrors(prev => ({
        ...prev,
        [field]: false,
      }));
    }
  };

  // Validate on blur and handle template updates
  const handleBlur = () => {
    const hasSubject = !!subjectValue.trim();
    const hasBody = !!bodyValue.trim();

    setValidationErrors({
      subject: !hasSubject && hasBody,
      body: hasSubject && !hasBody,
    });

    if (!hasSubject && !hasBody) {
      dispatch({
        type: "REMOVE_TEMPLATE",
        channel: activeChannel,
      });
    } else {
      if (hasSubject && hasBody) {
        updateTemplateForActiveChannel();
      }
    }
  };

  const errorMsg = t`Both subject and content are required`;
  const inputConfig = {
    subject: {
      placeholder: t`Enter subject for ${templateState.activeTab}`,
      value: subjectValue,
      onChange: (value: string) => handleUpdate("subject", value),
      error: validationErrors.subject ? errorMsg : undefined,
    },
    body: {
      placeholder: t`Enter content for ${templateState.activeTab}`,
      value: bodyValue,
      onChange: (value: string) => handleUpdate("body", value),
      error: validationErrors.body ? errorMsg : undefined,
    },
  };

  return (
    <>
      <TextInput
        label={t`Subject`}
        placeholder={inputConfig.subject.placeholder}
        value={inputConfig.subject.value}
        onChange={event =>
          inputConfig.subject.onChange(event.currentTarget.value)
        }
        onBlur={handleBlur}
        error={inputConfig.subject.error}
        mb="md"
      />

      <Textarea
        autosize
        label={t`Content`}
        placeholder={inputConfig.body.placeholder}
        minRows={4}
        value={inputConfig.body.value}
        onChange={event => inputConfig.body.onChange(event.currentTarget.value)}
        onBlur={handleBlur}
        error={inputConfig.body.error}
      />
    </>
  );
};

// Reducer function for template state management
const templateReducer = (
  state: TemplateState,
  action: TemplateAction,
): TemplateState => {
  switch (action.type) {
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.tab };
    case "UPDATE_TEMPLATE":
      if (state.templates[action.channel]) {
        return {
          ...state,
          templates: {
            ...state.templates,
            [action.channel]: {
              ...state.templates[action.channel],
              [action.field]: action.value,
            },
          },
        };
      }
      return state;
    case "REMOVE_TEMPLATE":
      return {
        ...state,
        templates: {
          ...state.templates,
          [action.channel]: null,
        },
        // If the active tab is being removed, we need to switch to another tab
        ...(state.activeTab === action.channel && {
          activeTab:
            action.channel === "email"
              ? state.templates.slack
                ? "slack"
                : null
              : state.templates.email
                ? "email"
                : null,
        }),
      };
    default:
      return state;
  }
};

const templateTypeMap = {
  "channel/email": {
    name: t`Email template`,
    type: "email/handlebars-text",
    stateKey: "email",
  },
  "channel/slack": {
    name: t`Slack template`,
    type: "slack/handlebars-text",
    stateKey: "slack",
  },
};

// Determine if a handler should be updated with template content
const shouldUpdateHandler = (
  handler: NotificationHandler,
  activeTab: string | null,
): boolean => {
  const channelType = handler.channel_type as keyof typeof templateTypeMap;
  const stateKey = templateTypeMap[channelType]?.stateKey;

  if (!stateKey) {
    return false;
  }

  // Update if this is the active channel
  return activeTab === stateKey;
};

// Get template content for a handler
const getTemplateContent = (
  handler: NotificationHandler,
  templates: TemplateState["templates"],
) => {
  const channelType = handler.channel_type as keyof typeof templateTypeMap;
  const stateKey = templateTypeMap[channelType]?.stateKey as "email" | "slack";

  return templates[stateKey];
};

export const NotificationChannelsPicker = ({
  notificationHandlers,
  channels: nullableChannels,
  onChange,
  getInvalidRecipientText,
  enableTemplates = false,
}: NotificationChannelsPickerProps) => {
  const { data: httpChannelsConfig = [] } = useListChannelsQuery();
  const { data: users } = useListUserRecipientsQuery();
  const user = useSelector(getUser);
  const userCanAccessSettings = useSelector(canAccessSettings);

  const usersListOptions: User[] = users?.data || (user ? [user] : []);

  // Default to show the default channels until full formInput is loaded
  const channels = (nullableChannels ||
    DEFAULT_CHANNELS_CONFIG) as ChannelApiResponse["channels"];

  const { emailHandler, slackHandler, hookHandlers } =
    getNotificationHandlersGroupedByTypes(notificationHandlers);

  // Determine which channels are available
  const hasEmailChannel = channels.email?.configured && !!emailHandler;
  const hasSlackChannel = channels.slack?.configured && !!slackHandler;

  // Calculate if we should show the templates section
  const hasAnyChannel = hasEmailChannel || hasSlackChannel;
  const canShowTemplates = enableTemplates && hasAnyChannel;

  // Check if any handlers have templates already configured
  // const hasExistingTemplates = useMemo(, [notificationHandlers]);

  // Template visibility state - show if templates already exist, otherwise hide by default
  const [showTemplateSection, setShowTemplateSection] = useState(() => {
    return notificationHandlers.some(
      handler =>
        handler.template &&
        handler.template.details &&
        (handler.template.details.subject?.trim() ||
          handler.template.details.body?.trim()),
    );
  });

  // Initial state for templates
  const initialTemplateState: TemplateState = useMemo(() => {
    // Extract existing template data from notification handlers
    const extractTemplateData = () => {
      const templates = {
        email: hasEmailChannel ? { subject: "", body: "" } : null,
        slack: hasSlackChannel ? { subject: "", body: "" } : null,
      };

      // Look for existing templates in handlers
      notificationHandlers.forEach(handler => {
        if (!handler.template) {
          return;
        }

        const { channel_type, details } = handler.template;
        const channelType = channel_type as keyof typeof templateTypeMap;
        const stateKey = templateTypeMap[channelType]?.stateKey;

        if (!stateKey || !details?.subject || !details?.body) {
          return;
        }

        // Populate template data from handler
        if (stateKey === "email" && templates.email) {
          templates.email.subject = details.subject;
          templates.email.body = details.body;
        } else if (stateKey === "slack" && templates.slack) {
          templates.slack.subject = details.subject;
          templates.slack.body = details.body;
        }
      });

      return templates;
    };

    return {
      activeTab: hasEmailChannel ? "email" : hasSlackChannel ? "slack" : null,
      templates: extractTemplateData(),
    };
  }, [hasEmailChannel, hasSlackChannel, notificationHandlers]);

  useEffect(() => {
    if (showTemplateSection) {
      dispatch({ type: "SET_ACTIVE_TAB", tab: initialTemplateState.activeTab });
    }
  }, [showTemplateSection, initialTemplateState]);
  console.log({ canShowTemplates, showTemplateSection });

  const [templateState, dispatch] = useReducer(
    templateReducer,
    initialTemplateState,
  );

  const addChannel = (channel: ChannelToAddOption) => {
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
  };

  const onChannelChange = (
    oldConfig: NotificationHandler,
    newConfig: NotificationHandler,
  ) => {
    const updatedChannels = notificationHandlers.map(value =>
      value === oldConfig ? newConfig : value,
    );

    onChange(updatedChannels);
  };

  const onRemoveChannel = (channel: NotificationHandler) => {
    const updatedChannels = notificationHandlers.filter(
      value => value !== channel,
    );

    // Set the template to null for the removed channel
    if (enableTemplates) {
      if (channel.channel_type === "channel/email") {
        dispatch({ type: "REMOVE_TEMPLATE", channel: "email" });
      } else if (channel.channel_type === "channel/slack") {
        dispatch({ type: "REMOVE_TEMPLATE", channel: "slack" });
      }
    }

    onChange(updatedChannels);
  };

  // Function to update template for the active channel
  const updateTemplateForActiveChannel = () => {
    if (!enableTemplates) {
      return;
    }

    // Update all applicable handlers using the extracted utility functions
    const updatedHandlers = notificationHandlers.map(handler => {
      // Check if this handler should be updated based on current state
      if (!shouldUpdateHandler(handler, templateState.activeTab)) {
        return handler;
      }

      const channelType = handler.channel_type as keyof typeof templateTypeMap;
      if (!templateTypeMap[channelType]) {
        return handler;
      }

      const templateConfig = templateTypeMap[channelType];
      const templateContent = getTemplateContent(
        handler,
        templateState.templates,
      );

      // Skip if no template content
      if (!templateContent) {
        return handler;
      }

      // Update the handler with the template
      return {
        ...handler,
        template: {
          id: handler.template_id,
          name: templateConfig.name,
          channel_type: channelType,
          details: {
            type: templateConfig.type,
            subject: templateContent.subject,
            body: templateContent.body,
          },
        },
      };
    });

    onChange(updatedHandlers);
  };

  return (
    <Stack gap="xl" align="start" w="100%">
      {channels.email?.configured && !!emailHandler && (
        <ChannelSettingsBlock
          title={t`Email`}
          iconName="mail"
          onRemoveChannel={() => onRemoveChannel(emailHandler)}
        >
          <EmailChannelEdit
            channel={emailHandler}
            users={usersListOptions}
            invalidRecipientText={getInvalidRecipientText}
            onChange={newConfig => onChannelChange(emailHandler, newConfig)}
          />
        </ChannelSettingsBlock>
      )}

      {channels.slack?.configured && !!slackHandler && (
        <ChannelSettingsBlock
          title={t`Slack`}
          iconName="int"
          onRemoveChannel={() => onRemoveChannel(slackHandler)}
        >
          <SlackChannelFieldNew
            channel={slackHandler}
            channelSpec={channels.slack}
            onChange={newConfig => onChannelChange(slackHandler, newConfig)}
          />
        </ChannelSettingsBlock>
      )}

      {userCanAccessSettings &&
        hookHandlers &&
        hookHandlers.map(channel => (
          <ChannelSettingsBlock
            key={`webhook-${channel.channel_id}`}
            title={
              httpChannelsConfig.find(({ id }) => id === channel.channel_id)
                ?.name || t`Webhook`
            }
            iconName="webhook"
            onRemoveChannel={() => onRemoveChannel(channel)}
          />
        ))}
      {(canShowTemplates || showTemplateSection) && (
        <Flex direction="column" w="100%" align="start">
          {!showTemplateSection && (
            <Button
              p={0}
              variant="subtle"
              onClick={() => setShowTemplateSection(!showTemplateSection)}
            >
              {showTemplateSection ? t`Hide templates` : t`Add custom template`}
            </Button>
          )}
          {showTemplateSection && (
            <Flex direction="column" mb="md" w="100%">
              <Box mb="xs">
                <h3>{t`Custom templates`}</h3>
              </Box>

              <Tabs
                value={templateState.activeTab}
                onChange={value => {
                  dispatch({ type: "SET_ACTIVE_TAB", tab: value });
                }}
              >
                <Tabs.List>
                  {hasEmailChannel && (
                    <Tabs.Tab value="email">{t`Email`}</Tabs.Tab>
                  )}
                  {hasSlackChannel && (
                    <Tabs.Tab value="slack">{t`Slack`}</Tabs.Tab>
                  )}
                </Tabs.List>

                <Box mt="md">
                  <TemplateInputs
                    templateState={templateState}
                    dispatch={dispatch}
                    updateTemplateForActiveChannel={
                      updateTemplateForActiveChannel
                    }
                  />
                </Box>
              </Tabs>
            </Flex>
          )}
        </Flex>
      )}

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
