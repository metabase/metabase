import { Button, Group, Icon } from "metabase/ui";
import type { NotificationHandler } from "metabase-types/api";

export interface DefaultTemplate {
  name: string;
  description: string;
  body: string;
}

interface DefaultTemplatesPickerProps {
  channelHandler: NotificationHandler;
  templates: DefaultTemplate[];
  currentValue: string | undefined;
  onClick: (value: string) => void;
  onMouseEnter?: (template: DefaultTemplate) => void;
  onMouseLeave?: () => void;
}

export const DefaultTemplatesPicker = ({
  channelHandler,
  currentValue,
  onClick,
  onMouseEnter,
  onMouseLeave,
  templates,
}: DefaultTemplatesPickerProps) => {
  return (
    <Group gap="xs">
      {templates &&
        templates
          ?.filter(
            (template) =>
              !channelHandler.template || template.body !== currentValue,
          )
          .map((template) => (
            <Button
              key={template.name}
              style={{
                flexGrow: 1,
                flexBasis: "auto",
                flexShrink: 1,
                minWidth: 0,
              }}
              variant="default"
              leftSection={<Icon name="snippet" />}
              onClick={() => {
                onClick(template.body);
              }}
              onMouseEnter={() => {
                onMouseEnter?.(template);
              }}
              onMouseLeave={() => {
                onMouseLeave?.();
              }}
            >
              {template.name}
            </Button>
          ))}
    </Group>
  );
};
