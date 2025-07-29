import { t } from "ttag";

import { Group, Icon, Box } from "metabase/ui";

interface SlashCommandOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  onSelect: () => void;
}

interface SlashCommandMenuProps {
  onInsertChart: () => void;
  onAskMetabot: () => void;
  selectedIndex: number;
  onKeyDown: (event: KeyboardEvent) => void;
}

export const SlashCommandMenu = ({
  onInsertChart,
  onAskMetabot,
  selectedIndex,
}: SlashCommandMenuProps) => {
  const options: SlashCommandOption[] = [
    {
      id: "insert-chart",
      label: t`Insert a chart`,
      description: t`Embed a question or visualization`,
      icon: "insight",
      onSelect: onInsertChart,
    },
    {
      id: "ask-metabot",
      label: t`Ask metabot`,
      description: t`Get AI assistance with your report`,
      icon: "metabot",
      onSelect: onAskMetabot,
    },
  ];

  return (
    <Box p="xs">
      {options.map((option, index) => (
        <Box
          key={option.id}
          p="sm"
          style={{
            cursor: "pointer",
            backgroundColor: selectedIndex === index ? "var(--mb-color-brand-lighter)" : "transparent",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
          onClick={option.onSelect}
          onMouseEnter={() => {
            // We'll handle hover selection in the parent component
          }}
        >
          <Icon
            name={option.icon}
            size={16}
            style={{
              color: selectedIndex === index ? "var(--mb-color-brand)" : "var(--mb-color-text-medium)"
            }}
          />
          <Box style={{ flex: 1 }}>
            <Box
              style={{
                fontWeight: 500,
                fontSize: "14px",
                color: selectedIndex === index ? "var(--mb-color-brand)" : "var(--mb-color-text-dark)",
              }}
            >
              {option.label}
            </Box>
            <Box
              style={{
                fontSize: "12px",
                color: "var(--mb-color-text-medium)",
                marginTop: "2px",
              }}
            >
              {option.description}
            </Box>
          </Box>
        </Box>
      ))}
    </Box>
  );
};
