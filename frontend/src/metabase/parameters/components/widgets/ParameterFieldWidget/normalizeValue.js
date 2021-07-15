export const normalizeValue = value =>
  Array.isArray(value) ? value : value != null ? [value] : [];
