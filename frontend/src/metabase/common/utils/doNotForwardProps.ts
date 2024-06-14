export const doNotForwardProps = (...propNamesToBlock: string[]) => ({
  shouldForwardProp: (propName: string) => !propNamesToBlock.includes(propName),
});
