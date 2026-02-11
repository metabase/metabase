import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

export const ENTITY_ICONS = {
  "entity/UserTable": "person",
  "entity/CompanyTable": "factory",
  "entity/TransactionTable": "receipt",
  package: "package",
  sticky_note: "sticky_note",
  "entity/EventTable": "calendar",
  "entity/SubscriptionTable": "sync",
  location: "location",
  pivot_table: "pivot_table",
  message_circle: "message_circle",
  octagon_alert: "octagon_alert",
  "entity/ProductTable": "label",
  "entity/GenericTable": "document",
  zap: "zap",
  camera: "camera",
} satisfies Record<string, IconName>;

export const getEntityIcon = (entityType?: string) => {
  return (
    entityType
      ? ENTITY_ICONS[entityType as keyof typeof ENTITY_ICONS] || "document"
      : "document"
  ) as IconName;
};

export const ENTITY_ICON_COLORS: ColorName[] = [
  "text-primary",
  "brand",
  "accent1",
  "accent2",
  "accent3",
  "accent6",
];

// For icons with default color, use white background,
// otherwise derive transparent background from custom color.
export function getIconBackground(iconColor?: string) {
  if (!iconColor) {
    return "var(--mb-color-white)";
  }

  return iconColor !== color("text-primary")
    ? `color-mix(in srgb, ${color(iconColor)}, transparent 88%)`
    : "var(--mb-color-white)";
}

const CATEGORY_COLORS = [
  "accent0",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "accent7",
];

// Get a consistent color for a category value based on its hash
export const getCategoryColor = (categoryValue: any, columnName: string) => {
  if (categoryValue == null || categoryValue === "") {
    return "var(--mb-color-background-secondary)";
  }

  const stringValue = String(categoryValue);

  // Use a combination of column name and value for more consistent colors
  const hashInput = `${columnName}:${stringValue}`;
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    // 5 is used to implement DJB2-like hashing: (hash * 33) + char
    // Bit shifting by 5 (<< 5) is equivalent to multiplying by 32 (2^5)
    hash = (hash << 5) + hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  const colorIndex = Math.abs(hash) % CATEGORY_COLORS.length;
  return color(CATEGORY_COLORS[colorIndex]);
};
