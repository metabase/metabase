const COMPLETION_HEIGHT = 32;
const HEADER_HEIGHT = 42;
const FOOTER_HEIGHT = 42;

export function getListboxHeight({
  maxHeight,
  isHelpTextOpen,
  hasHelpText,
  options,
}: {
  maxHeight: number;
  isHelpTextOpen: boolean;
  hasHelpText: boolean;
  options: readonly unknown[];
}) {
  const completionsHeight = options.length * COMPLETION_HEIGHT + FOOTER_HEIGHT;
  const innerHeight = maxHeight - HEADER_HEIGHT;

  if (options.length === 0) {
    return 0;
  }

  if (isHelpTextOpen) {
    return Math.min(completionsHeight, innerHeight / 2);
  }

  if (hasHelpText) {
    return Math.min(completionsHeight, innerHeight);
  }

  return Math.min(completionsHeight, maxHeight);
}

export function getHelpTextHeight({
  maxHeight,
  listboxHeight,
  isListboxOpen,
}: {
  maxHeight: number;
  listboxHeight: number;
  isListboxOpen: boolean;
}) {
  const innerHeight = maxHeight - HEADER_HEIGHT;
  if (isListboxOpen) {
    return Math.max(innerHeight - listboxHeight, innerHeight / 2);
  }
  return innerHeight;
}
