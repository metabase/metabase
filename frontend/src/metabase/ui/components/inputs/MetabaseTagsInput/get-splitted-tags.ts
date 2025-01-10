function splitTags(splitChars: string[] | undefined, value: string) {
  if (!splitChars) {
    return [value];
  }

  return value
    .split(new RegExp(`[${splitChars.join('')}]`))
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

interface GetSplittedTagsInput {
  splitChars: string[] | undefined;
  allowDuplicates: boolean | undefined;
  maxTags: number | undefined;
  value: string;
  currentTags: string[];
}

export function getSplittedTags({
  splitChars,
  allowDuplicates,
  maxTags,
  value,
  currentTags,
}: GetSplittedTagsInput) {
  const splitted = splitTags(splitChars, value);
  const merged = allowDuplicates
    ? [...currentTags, ...splitted]
    : [...new Set([...currentTags, ...splitted])];

  return maxTags ? merged.slice(0, maxTags) : merged;
}
