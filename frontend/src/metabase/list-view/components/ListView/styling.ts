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
} as const;

export const getEntityIcon = (entityType?: string) => {
  return entityType
    ? ENTITY_ICONS[entityType as keyof typeof ENTITY_ICONS] || "document"
    : "document";
};

export const ENTITY_ICON_COLORS = [
  color("text-primary"),
  color("brand"),
  color("accent1"),
  color("accent2"),
  color("accent3"),
  color("accent6"),
];

// For icons with default color, use white background,
// otherwise derive transparent background from custom color.
export function getIconBackground(iconColor?: string) {
  if (!iconColor) {
    return "var(--mb-color-white)";
  }

  return iconColor !== "text-primary"
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
export const getCategoryColor = (value: any, columnName: string) => {
  if (value == null || value === "") {
    return "var(--mb-color-background-light)";
  }

  const stringValue = String(value);

  // Use a combination of column name and value for more consistent colors
  const combinedString = `${columnName}:${stringValue}`;
  const hash = combinedString.split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);

  const colorIndex = Math.abs(hash) % CATEGORY_COLORS.length;
  return color(CATEGORY_COLORS[colorIndex]);
};
