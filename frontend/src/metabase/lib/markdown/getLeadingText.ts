export const getLeadingText = (elements: Element[]): string => {
  const firstTextChild = elements.find(child => child.textContent);
  return firstTextChild?.textContent || "";
};
